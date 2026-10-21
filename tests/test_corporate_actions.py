import json
import tempfile
import unittest
from pathlib import Path
import pandas as pd
from scripts.sync_corporate_actions import serialize_actions, write_actions


class CorporateActionTests(unittest.TestCase):
    def test_splits_dividends_and_zero_events(self):
        dates = pd.to_datetime(['2026-08-03', '2026-09-01']).tz_localize('Asia/Jakarta')
        frame = pd.DataFrame({'Dividends':[120, 0], 'Stock Splits':[0, 2]}, index=dates)
        self.assertEqual(serialize_actions(frame), [
            {'date':'2026-08-03','type':'dividend','value':120.0},
            {'date':'2026-09-01','type':'split','value':2.0},
        ])

    def test_writes_provenance_without_claiming_exchange_verification(self):
        with tempfile.TemporaryDirectory() as tmp:
            write_actions('BBCA', [{'date':'2026-08-03','type':'dividend','value':120}], Path(tmp))
            item = json.loads((Path(tmp)/'BBCA.json').read_text())
            self.assertFalse(item['verifiedByExchange'])
            self.assertEqual(item['events'][0]['type'], 'dividend')


if __name__ == '__main__':
    unittest.main()
