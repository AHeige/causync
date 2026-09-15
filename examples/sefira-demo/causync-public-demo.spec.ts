import { expect, test, type Locator, type Page } from '@playwright/test'

function comparisonSide(page: Page, name: 'Without Causync' | 'With Causync'): Locator {
  return page.locator('article').filter({ has: page.getByText(name, { exact: true }) })
}

test.describe('Causync public fault lab', () => {
  test('preserves the latest rapid intent after an intermediate rejection', async ({ page }) => {
    await page.goto('/causync')
    await page.getByRole('button', { name: 'Run A → B → A' }).click()

    await expect(comparisonSide(page, 'With Causync').getByText('Complete', { exact: true })).toBeVisible()
    await expect(comparisonSide(page, 'Without Causync').getByText('Open', { exact: true })).toBeVisible({ timeout: 3_000 })
    await expect(comparisonSide(page, 'With Causync').getByText('Complete', { exact: true })).toBeVisible()
  })

  test('holds the Today overlay while the authoritative projection is stale', async ({ page }) => {
    await page.goto('/causync')
    await page.getByRole('button', { name: 'Projection lag' }).click()
    await page.getByRole('button', { name: 'Move task to Today' }).click()

    await expect(comparisonSide(page, 'Without Causync').getByText('Inbox', { exact: true })).toBeVisible({ timeout: 1_000 })
    await expect(comparisonSide(page, 'With Causync').getByText('Today', { exact: true })).toBeVisible()
    await expect(comparisonSide(page, 'With Causync').getByText(/Confirmed · Covered/)).toBeVisible({ timeout: 3_000 })
  })

  test('recovers a committed mutation with the same identity after its response is lost', async ({ page }) => {
    await page.goto('/causync')
    await page.getByRole('button', { name: 'Lost response' }).click()
    await page.getByRole('button', { name: 'Rename on weak network' }).click()

    await expect(comparisonSide(page, 'Without Causync').getByText('Atlas', { exact: true })).toBeVisible({ timeout: 1_500 })
    await expect(comparisonSide(page, 'With Causync').getByText('Northstar', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Recover same mutation' }).click()
    await expect(comparisonSide(page, 'With Causync').getByText('Confirmed', { exact: true })).toBeVisible()
    await expect(comparisonSide(page, 'With Causync').getByText(/rename-stable-id attempt 2 → confirmed/)).toBeVisible()
  })
})
