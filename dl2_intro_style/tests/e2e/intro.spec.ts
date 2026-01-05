import { test, expect } from '@playwright/test'

test('skip hold completes intro', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.keyboard.down('Space')
  await page.waitForTimeout(700)
  await page.keyboard.up('Space')

  await expect(page.locator('#app')).toHaveAttribute('data-state', 'completed')
  await page.screenshot({ path: testInfo.outputPath('completed.png'), fullPage: true })
})
