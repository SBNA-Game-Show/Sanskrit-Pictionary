import { test, expect } from '@playwright/test';

test.setTimeout(10 * 60 * 1000);

test('host can force skip a round', async ({ browser }) => {
  const users = [
    { name: 'host', email: 'hosttest2@gmail.com', password: '12345678' },
    { name: 'a', email: 'etest@gmail.com', password: '12345678' },
    { name: 'b', email: 'ftest@gmail.com', password: '12345678' },
    { name: 'c', email: 'gtest@gmail.com', password: '12345678' },
    { name: 'd', email: 'htest@gmail.com', password: '12345678' },
  ];

  const sessions = {};

  try {
    for (const user of users) {
      const context = await browser.newContext();
      const page = await context.newPage();

      await login(page, user.email, user.password);
      await expect(page).toHaveURL(/.*lobby/);

      sessions[user.name] = { ...user, context, page };
    }

    const hostPage = sessions.host.page;

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

    for (const name of ['host', 'a', 'b', 'c', 'd']) {
      await expect(sessions[name].page).toHaveURL(new RegExp(`/play/${roomId}$`));
    }

    await expect(hostPage.getByTestId('warn-drawer-button')).toBeVisible();
    await expect(hostPage.getByTestId('force-skip-round-button')).toBeVisible();
    await expect(hostPage.getByTestId('drawer-name')).toBeVisible();

    const oldDrawerText = await hostPage.getByTestId('drawer-name').textContent();

    await hostPage.getByTestId('force-skip-round-button').click();

    await Promise.race([
      expect
        .poll(
          async () => await hostPage.getByTestId('drawer-name').textContent(),
          { timeout: 20000, intervals: [500, 1000] }
        )
        .not.toBe(oldDrawerText),

      expect(hostPage).toHaveURL(/\/end$/, { timeout: 20000 }),
    ]).catch(() => {});

    if (!/\/end$/.test(hostPage.url())) {
      const newDrawerText = await hostPage.getByTestId('drawer-name').textContent();
      expect(newDrawerText).not.toBe(oldDrawerText);
    }
  } finally {
    await Promise.all(
      Object.values(sessions).map((session) => session.context.close())
    );
  }
});

async function login(page, email, password) {
  await page.goto('/signin');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('signin-button').click();
}