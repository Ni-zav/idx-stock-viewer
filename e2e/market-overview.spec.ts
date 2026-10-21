import { test, expect, type Page } from '@playwright/test'

const candles = [
  'Date,Ticker,Open,High,Low,Close,Adj Close,Volume',
  '2026-10-19,BBCA,7800,7900,7700,7850,7850,1000',
  '2026-10-20,BBCA,7900,8000,7850,7950,7900,1500',
  '2026-10-21,BBCA,8000,8200,7900,8100,8000,2500',
].join('\n') + '\n'

async function mockedMarket(page: Page) {
  await page.route('**/data/idx_tickers.csv*', r => r.fulfill({
    status: 200, contentType: 'text/csv', body: 'Ticker\nBBCA\nBBRI\n',
  }))
  await page.route('**/data/dashboard.json*', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify([
      { t:'BBCA', p:8100, c1d:2, p1d:150, c1w:1, c1m:5, c1y:10, ca:15, sl:[7800,7950,8100],v:2500,source:'yahoo-daily',asOfDate:'2026-10-21' },
      { t:'BBRI', p:5000, c1d:-1, p1d:-50, c1w:-2, c1m:-3, c1y:3, ca:7, sl:[5200,5100,5000],v:4000,source:'yahoo-daily',asOfDate:'2026-10-21' },
    ]),
  }))
  await page.route('**/data/tickers/BBCA.csv*', r => r.fulfill({
    status: 200, contentType:'text/csv', body:candles,
  }))
  await page.route('**/data/intraday/**', r => r.fulfill({status:404,body:'not found'}))
  await page.route('**/data/actions/BBCA.json*', r => r.fulfill({
    status: 200, contentType:'application/json',
    body: JSON.stringify({ticker:'BBCA',fetchedAt:'2026-10-21T01:00:00Z',
      verifiedByExchange:false,events:[{date:'2026-07-01',type:'dividend',value:100}]}),
  }))
  await page.route('**/api/prices*', r => r.fulfill({status:200, contentType:'application/json', body:'{"prices":{}}'}))
  await page.route('**/api/smart-check/**', r => r.fulfill({status:200, contentType:'application/json', body:'{"needs_update":false}'}))
  await page.route('**/api/**', r => r.fulfill({status:200,contentType:'application/json',body:'{}'}))
}

test('searching, saving a watchlist and reloading preserve symbol choices', async ({page}) => {
  await mockedMarket(page)
  await page.goto('/')
  await expect(page.getByText('MARKET OVERVIEW')).toBeVisible()
  await expect(page.locator('tbody tr')).toHaveCount(2)
  await page.getByPlaceholder('Filter ticker (e.g. BBCA)').fill('BBRI')
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody')).toContainText('BBRI')
  await page.getByPlaceholder('Filter ticker (e.g. BBCA)').fill('')
  await page.getByRole('button', {name:'Add BBCA to watchlist'}).click()
  await page.getByRole('button', {name:/Watchlist \(1\)/}).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody')).toContainText('BBCA')
  await page.reload()
  await page.getByRole('button', {name:/Watchlist \(1\)/}).click()
  await expect(page.locator('tbody tr')).toHaveCount(1)
  await expect(page.locator('tbody')).toContainText('BBCA')
})

test('chart renders provider candles, adjusted mode and sourced corporate actions', async ({page}) => {
  await mockedMarket(page)
  await page.goto('/')
  await page.locator('tbody tr').filter({hasText:'BBCA'}).getByRole('button', {name:'VIEW'}).click()
  await expect(page.locator('.chart-wrapper canvas').first()).toBeVisible()
  await expect(page.locator('.corporate-actions summary')).toContainText('Yahoo corporate actions (1)')
  await page.locator('.corporate-actions summary').click()
  await expect(page.locator('.corporate-actions')).toContainText('dividend')
  await page.locator('.price-mode-control select').selectOption('adjusted')
  await expect(page.getByText(/Adjusted OHLC is scaled by Yahoo/)).toBeVisible()
  await expect(page.locator('.chart-wrapper canvas').first()).toBeVisible()
})
