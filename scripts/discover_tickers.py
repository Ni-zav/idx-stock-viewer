#!/usr/bin/env python3
"""
Smart IDX Ticker Discovery
==========================
Uses intelligent patterns to discover new tickers quickly.

Strategies:
1. Test variations of existing tickers (BBCA -> BBCB, BBCC, etc.)
2. Test common IDX naming patterns (sector prefixes)
3. Test alphabetically near existing tickers

Usage:
  python discover_tickers.py                # Run smart discovery
  python discover_tickers.py --validate     # Validate existing tickers
"""

import csv
import yfinance as yf
from pathlib import Path
import sys
import argparse
import time
import json
from datetime import datetime
import warnings

warnings.filterwarnings('ignore')

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

BASE_DIR = Path(__file__).parent
TICKERS_CSV = BASE_DIR / 'public' / 'data' / 'idx_tickers.csv'
TICKERS_DIR = BASE_DIR / 'public' / 'data' / 'tickers'
DELISTED_FILE = BASE_DIR / 'delisted_tickers.json'
DISCOVERY_STATE = BASE_DIR / 'discovery_state.json'

ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

def get_existing_tickers():
    tickers = set()
    if TICKERS_CSV.exists():
        with open(TICKERS_CSV, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                t = row.get('Ticker', '').strip()
                if t: tickers.add(t)
    return tickers

def get_delisted():
    if DELISTED_FILE.exists():
        with open(DELISTED_FILE, 'r') as f:
            return set(json.load(f).get('delisted', []))
    return set()

def add_to_delisted(ticker):
    current = get_delisted()
    current.add(ticker)
    with open(DELISTED_FILE, 'w') as f:
        json.dump({'delisted': sorted(list(current)), 'timestamp': datetime.now().isoformat()}, f, indent=2)

def get_state():
    if DISCOVERY_STATE.exists():
        with open(DISCOVERY_STATE, 'r') as f:
            return json.load(f)
    return {'tested': [], 'found': []}

def save_state(state):
    state['timestamp'] = datetime.now().isoformat()
    with open(DISCOVERY_STATE, 'w') as f:
        json.dump(state, f, indent=2)

def save_tickers(tickers):
    with open(TICKERS_CSV, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['Ticker'])
        writer.writeheader()
        for t in sorted(tickers):
            writer.writerow({'Ticker': t})

def test_ticker(ticker):
    """Test if ticker exists on Yahoo Finance"""
    try:
        stock = yf.Ticker(f"{ticker}.JK")
        info = stock.info
        if info and (info.get('regularMarketPrice') or info.get('previousClose')):
            return True
        hist = stock.history(period='5d')
        return len(hist) > 0
    except Exception:
        return False

def generate_smart_candidates(existing, delisted, tested):
    """Generate candidates using smart patterns"""
    candidates = set()
    skip = existing | delisted | set(tested)
    
    # Strategy 1: Variations of last letter (BBCA -> BBCB, BBCC, etc.)
    for ticker in existing:
        if len(ticker) == 4:
            prefix = ticker[:3]
            for letter in ALPHABET:
                candidate = prefix + letter
                if candidate not in skip:
                    candidates.add(candidate)
    
    # Strategy 2: Variations of second-to-last letter
    for ticker in existing:
        if len(ticker) == 4:
            prefix = ticker[:2]
            suffix = ticker[3]
            for letter in ALPHABET:
                candidate = prefix + letter + suffix
                if candidate not in skip:
                    candidates.add(candidate)
    
    # Strategy 3: Common sector prefixes with new endings
    # Banks: BB, BN, BI; Property: PP, PW; Mining: AD, PT, etc.
    common_prefixes = ['AA', 'AB', 'AC', 'AD', 'AG', 'AK', 'AM', 'AN', 'AP', 'AR', 'AS', 'AT', 'AV', 
                       'BA', 'BB', 'BC', 'BD', 'BE', 'BG', 'BI', 'BJ', 'BK', 'BL', 'BM', 'BN', 'BO', 'BP', 'BR', 'BS', 'BT', 'BU', 'BV', 'BW', 'BY',
                       'CA', 'CB', 'CC', 'CE', 'CF', 'CI', 'CL', 'CM', 'CN', 'CO', 'CP', 'CR', 'CS', 'CT', 'CU', 'CY',
                       'DA', 'DE', 'DF', 'DG', 'DI', 'DK', 'DL', 'DM', 'DN', 'DO', 'DP', 'DR', 'DS', 'DU', 'DY',
                       'EA', 'EC', 'ED', 'EL', 'EM', 'EN', 'EP', 'ER', 'ES', 'ET', 'EU', 'EX',
                       'FA', 'FI', 'FL', 'FM', 'FO', 'FP', 'FR', 'FU', 'FW',
                       'GA', 'GD', 'GE', 'GG', 'GI', 'GJ', 'GL', 'GM', 'GN', 'GO', 'GP', 'GR', 'GS', 'GT', 'GZ',
                       'HA', 'HD', 'HE', 'HI', 'HK', 'HM', 'HO', 'HR', 'HU', 'HY',
                       'IA', 'IB', 'IC', 'ID', 'IF', 'IG', 'II', 'IK', 'IM', 'IN', 'IP', 'IR', 'IS', 'IT',
                       'JA', 'JE', 'JG', 'JI', 'JK', 'JM', 'JO', 'JP', 'JR', 'JS', 'JT',
                       'KA', 'KB', 'KC', 'KD', 'KE', 'KI', 'KJ', 'KK', 'KL', 'KM', 'KO', 'KP', 'KR', 'KU', 'KW',
                       'LA', 'LC', 'LE', 'LF', 'LI', 'LM', 'LP', 'LR', 'LS', 'LT', 'LU',
                       'MA', 'MB', 'MC', 'MD', 'ME', 'MF', 'MG', 'MI', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MR', 'MS', 'MT', 'MU', 'MY',
                       'NA', 'NC', 'ND', 'NE', 'NF', 'NI', 'NJ', 'NK', 'NO', 'NP', 'NR', 'NS', 'NU', 'NZ',
                       'OA', 'OB', 'OC', 'OI', 'OK', 'OL', 'OM', 'OP', 'OS',
                       'PA', 'PB', 'PC', 'PD', 'PE', 'PF', 'PG', 'PI', 'PJ', 'PK', 'PL', 'PM', 'PN', 'PO', 'PP', 'PR', 'PS', 'PT', 'PU', 'PW', 'PY', 'PZ',
                       'RA', 'RB', 'RD', 'RE', 'RF', 'RI', 'RM', 'RO', 'RU',
                       'SA', 'SB', 'SC', 'SD', 'SE', 'SF', 'SG', 'SH', 'SI', 'SK', 'SL', 'SM', 'SN', 'SO', 'SP', 'SQ', 'SR', 'SS', 'ST', 'SU', 'SW',
                       'TA', 'TB', 'TC', 'TD', 'TE', 'TF', 'TG', 'TI', 'TK', 'TL', 'TM', 'TN', 'TO', 'TP', 'TR', 'TS', 'TU', 'TY',
                       'UA', 'UC', 'UD', 'UI', 'UL', 'UN', 'UR', 'UV',
                       'VI', 'VK', 'VO', 'VR', 'VT',
                       'WA', 'WE', 'WG', 'WI', 'WM', 'WO', 'WS', 'WT',
                       'YE', 'YP', 'YU',
                       'ZA', 'ZB', 'ZI', 'ZO', 'ZY']
    
    for prefix in common_prefixes:
        for c in ALPHABET:
            for d in ALPHABET:
                candidate = prefix + c + d
                if candidate not in skip and len(candidate) == 4:
                    candidates.add(candidate)
    
    return sorted(list(candidates))

def main():
    parser = argparse.ArgumentParser(description='Smart IDX ticker discovery')
    parser.add_argument('--batch', type=int, default=100, help='Tickers to test per run')
    parser.add_argument('--validate', action='store_true', help='Validate existing tickers')
    parser.add_argument('--reset', action='store_true', help='Reset progress')
    args = parser.parse_args()
    
    print("=" * 60)
    print("Smart IDX Ticker Discovery")
    print("=" * 60)
    
    existing = get_existing_tickers()
    delisted = get_delisted()
    state = get_state()
    
    if args.reset:
        state = {'tested': [], 'found': []}
        save_state(state)
        print("Discovery progress reset.")
    
    print(f"Current tickers: {len(existing)}")
    print(f"Delisted/Invalid: {len(delisted)}")
    print(f"Previously tested: {len(state.get('tested', []))}")
    print(f"Found so far: {len(state.get('found', []))}")
    
    if args.validate:
        print("\nValidating existing tickers (this will take a while)...")
        invalid = []
        for i, ticker in enumerate(sorted(existing)):
            print(f"\r[{i+1}/{len(existing)}] {ticker}...", end="", flush=True)
            if not test_ticker(ticker):
                invalid.append(ticker)
                print(f" INVALID")
            time.sleep(0.3)
        
        if invalid:
            print(f"\n\nFound {len(invalid)} invalid tickers:")
            for t in invalid:
                print(f"  - {t}")
                add_to_delisted(t)
            print("Added to delisted list.")
        else:
            print("\n\nAll tickers are valid!")
        return
    
    # Generate smart candidates
    print("\nGenerating smart candidates...")
    candidates = generate_smart_candidates(existing, delisted, state.get('tested', []))
    print(f"Candidates to test: {len(candidates)}")
    
    if not candidates:
        print("\nNo more candidates to test. All patterns exhausted.")
        print("Your ticker list is likely complete!")
        return
    
    batch = candidates[:args.batch]
    print(f"Testing first {len(batch)} candidates...")
    
    found = []
    tested = list(state.get('tested', []))
    
    for i, ticker in enumerate(batch):
        print(f"\r[{i+1}/{len(batch)}] Testing {ticker}...", end="", flush=True)
        
        if test_ticker(ticker):
            print(f" FOUND!")
            found.append(ticker)
        
        tested.append(ticker)
        time.sleep(0.3)
    
    # Save state
    state['tested'] = tested
    state['found'] = list(set(state.get('found', [])) | set(found))
    save_state(state)
    
    print(f"\n\nResults:")
    print(f"  Tested this run: {len(batch)}")
    print(f"  New tickers found: {len(found)}")
    
    if found:
        print(f"  New tickers: {', '.join(found)}")
        combined = existing | set(found)
        save_tickers(combined)
        print(f"  Updated list: {len(combined)} tickers")
    
    remaining = len(candidates) - len(batch)
    print(f"\n  Remaining candidates: {remaining}")
    if remaining > 0:
        print(f"  Run again to continue discovery.")

if __name__ == '__main__':
    main()
