import { test, expect } from '@playwright/test';

test.setTimeout(10 * 60 * 1000);

test('host creates room, players join teams, game runs until the end', async ({ browser }) => {
  const users = [
    { name: 'host', email: 'hosttest@gmail.com', password: '12345678' },
    { name: 'a', email: 'atest@gmail.com', password: '12345678' },
    { name: 'b', email: 'btest@gmail.com', password: '12345678' },
    { name: 'c', email: 'ctest@gmail.com', password: '12345678' },
    { name: 'd', email: 'dtest@gmail.com', password: '12345678' },
  ];

  const sessions = {};

  for (const user of users) {
    const context = await browser.newContext();
    const page = await context.newPage();

    await login(page, user.email, user.password);
    await expect(page).toHaveURL(/.*lobby/);

    sessions[user.name] = { ...user, context, page };
  }

  const hostPage = sessions.host.page;

  // --- lobby setup ---
  await hostPage.getByTestId('create-room-button').click();
  await expect(hostPage).toHaveURL(/.*\/lobby\/.*/);

  const roomId = (await hostPage.getByTestId('room-id').textContent())?.trim();
  expect(roomId).toBeTruthy();

  for (const playerName of ['a', 'b', 'c', 'd']) {
    const playerPage = sessions[playerName].page;
    await playerPage.getByTestId('room-input').fill(roomId);
    await playerPage.getByTestId('enter-room-button').click();
    await expect(playerPage).toHaveURL(new RegExp(`/lobby/${roomId}$`));
  }

  await expect(hostPage.getByTestId('lobby-page')).toBeVisible();

  await sessions.a.page.getByTestId('join-red-button').click();
  await sessions.b.page.getByTestId('join-red-button').click();
  await sessions.c.page.getByTestId('join-blue-button').click();
  await sessions.d.page.getByTestId('join-blue-button').click();

  await hostPage.getByTestId('rounds-2-button').click();
  await hostPage.getByTestId('timer-30-button').click();
  await hostPage.getByTestId('guesses-2-button').click();
  await hostPage.getByTestId('difficulty-medium-button').click();
  await hostPage.getByTestId('mode-learning-button').click();

  await expect(hostPage.getByTestId('start-game-button')).toBeEnabled();
  await hostPage.getByTestId('start-game-button').click();

  // --- everyone reaches play page ---
  for (const name of ['host', 'a', 'b', 'c', 'd']) {
    await expect(sessions[name].page).toHaveURL(new RegExp(`/play/${roomId}$`));
  }

  // --- basic play page readiness ---
  for (const name of ['host', 'a', 'b', 'c', 'd']) {
    const page = sessions[name].page;
    await expect(page.getByTestId('online-users-panel')).toBeVisible();
    await expect(page.getByTestId('drawer-name')).toBeVisible();
    await expect(page.getByTestId('time-box')).toBeVisible();
    await expect(page.getByTestId('drawing-canvas')).toBeVisible();
  }

  await expect(hostPage.getByTestId('warn-drawer-button')).toBeVisible();
  await expect(hostPage.getByTestId('force-skip-round-button')).toBeVisible();

  // Repeat rounds until game ends or safety cap reached
  const maxTurns = 12;

  for (let turn = 0; turn < maxTurns; turn++) {
    // stop if host already reached the end screen
    if (/\/end$/.test(hostPage.url())) break;

    const oldDrawerText = await hostPage.getByTestId('drawer-name').textContent();

    const eligibleGuesser = await findEligibleGuesser(sessions, ['a', 'b', 'c', 'd']);
    expect(eligibleGuesser, `Expected an eligible guesser on turn ${turn + 1}`).toBeTruthy();

    await expect(eligibleGuesser.page.getByTestId('choice-modal')).toBeVisible({ timeout: 20000 });
    await expect(eligibleGuesser.page.getByTestId('choice-grid')).toBeVisible({ timeout: 20000 });

    await eligibleGuesser.page.locator('[data-correct="true"]').first().click();

    // some rounds may show reveal popup before navigating / changing turn
    await expect(hostPage.getByTestId('round-reveal-popup')).toBeVisible({ timeout: 20000 });

    // wait for either next drawer OR end screen
    await Promise.race([
      expect
        .poll(
          async () => await hostPage.getByTestId('drawer-name').textContent(),
          { timeout: 20000, intervals: [500, 1000] }
        )
        .not.toBe(oldDrawerText),

      expect(hostPage).toHaveURL(/\/end$/, { timeout: 20000 }),
    ]).catch(() => {});

    // if game ended, stop loop
    if (/\/end$/.test(hostPage.url())) break;
  }

    // --- final assertion: everyone should end up on leaderboard ---
    for (const name of ['host', 'a', 'b', 'c', 'd']) {
      const page = sessions[name].page;

      await expect(page).toHaveURL(/\/end$/, { timeout: 30000 });

      // verify leaderboard UI
      await expect(page.getByTestId('leaderboard-page')).toBeVisible();
      await expect(page.getByTestId('leaderboard-title')).toHaveText(/Leaderboard/i);

      // verify both teams are shown
      await expect(page.getByTestId('leaderboard-red-team')).toBeVisible();
      await expect(page.getByTestId('leaderboard-blue-team')).toBeVisible();

      // verify at least 1 player appears
      await expect(page.locator('[data-testid^="leaderboard-player-"]').first()).toBeVisible();
    }

  await Promise.all(
    Object.values(sessions).map((session) => session.context.close())
  );
});

async function login(page, email, password) {
  await page.goto('/signin');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('signin-button').click();
}

async function findEligibleGuesser(sessions, playerNames) {
  for (const name of playerNames) {
    const page = sessions[name].page;
    const input = page.getByTestId('answer-input');

    await expect(input).toBeVisible({ timeout: 10000 });

    if (await input.isEnabled()) {
      return sessions[name];
    }
  }
  return null;
}