import { test, expect } from '@playwright/test';

test.setTimeout(10 * 60 * 1000);

test('host can kick a player', async ({ browser }) => {
  const users = [
    { name: 'host3', email: 'hosttest3@gmail.com', password: '12345678' },
    { name: 'ITest', email: 'itest@gmail.com', password: '12345678' },
    { name: 'JTest', email: 'jtest@gmail.com', password: '12345678' },
    { name: 'KTest', email: 'ktest@gmail.com', password: '12345678' },
    { name: 'LTest', email: 'ltest@gmail.com', password: '12345678' },
  ];

  const sessions = {};

  try {
    // --- login ---
    for (const user of users) {
      const context = await browser.newContext();
      const page = await context.newPage();

      await login(page, user.email, user.password);
      await expect(page).toHaveURL(/.*lobby/);

      sessions[user.name] = { ...user, context, page };
    }

    const hostPage = sessions.host3.page;

    // --- create room ---
    await hostPage.getByTestId('create-room-button').click();
    const roomId = (await hostPage.getByTestId('room-id').textContent())?.trim();

    // --- join players ---
    for (const name of ['ITest', 'JTest', 'KTest', 'LTest']) {
      const page = sessions[name].page;
      await page.getByTestId('room-input').fill(roomId);
      await page.getByTestId('enter-room-button').click();
    }

    // --- assign teams ---
    await sessions.ITest.page.getByTestId('join-red-button').click();
    await sessions.JTest.page.getByTestId('join-red-button').click();
    await sessions.KTest.page.getByTestId('join-blue-button').click();
    await sessions.LTest.page.getByTestId('join-blue-button').click();

    // --- start game ---
    await hostPage.getByTestId('rounds-2-button').click();
    await hostPage.getByTestId('timer-30-button').click();
    await hostPage.getByTestId('guesses-2-button').click();
    await hostPage.getByTestId('difficulty-medium-button').click();
    await hostPage.getByTestId('mode-learning-button').click();
    await hostPage.getByTestId('start-game-button').click();

    // --- ensure play page ---
    for (const name of ['host3', 'ITest', 'JTest', 'KTest', 'LTest']) {
      await expect(sessions[name].page).toHaveURL(/\/play/);
    }

    // --- choose a player to kick ---
    const target = sessions.ITest;

    // --- click kick button ---
    const targetCard = hostPage.locator('[data-testid^="player-"]').filter({
      hasText: target.name,
    }).first();

    await expect(targetCard).toBeVisible();
    await targetCard.getByRole('button', { name: 'Kick' }).click();

    // --- confirm modal ---
    await expect(hostPage.getByTestId('kick-modal')).toBeVisible();
    await hostPage.getByTestId('confirm-kick-button').click();

    // --- verify game ends after kick because one team falls below minimum ---
    for (const name of ['host3', 'JTest', 'KTest', 'LTest']) {
      const page = sessions[name].page;

      await expect(page).toHaveURL(/\/end$/, { timeout: 30000 });
      await expect(page.getByTestId('leaderboard-page')).toBeVisible();
      await expect(page.getByTestId('leaderboard-title')).toHaveText(/Leaderboard/i);
    }

  } finally {
    await Promise.all(
      Object.values(sessions).map((s) => s.context.close())
    );
  }
});

async function login(page, email, password) {
  await page.goto('/signin');
  await page.getByTestId('email-input').fill(email);
  await page.getByTestId('password-input').fill(password);
  await page.getByTestId('signin-button').click();
}