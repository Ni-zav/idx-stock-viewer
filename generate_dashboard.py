
import os
import glob
import pandas as pd
import json
from datetime import datetime, timedelta

DATA_DIR = 'public/data/tickers'
INTRADAY_DIR = 'public/data/intraday/1m'
OUTPUT_FILE = 'public/data/dashboard.json'

def calculate_change(current, old):
    if old == 0: return 0
    return ((current - old) / old) * 100

def get_intraday_data(ticker, daily_last_date_str):
    """
    Check if newer intraday data exists.
    Returns (price, volume, date_str) or None.
    """
    try:
        if not os.path.exists(INTRADAY_DIR):
            return None
            
        file_path = os.path.join(INTRADAY_DIR, f"{ticker}.csv")
        if not os.path.exists(file_path):
            return None
            
        # Read last few lines first to check date
        try:
           # Quick check of last line
           with open(file_path, 'rb') as f:
               try:
                   f.seek(-1024, os.SEEK_END)
               except OSError:
                   pass # File is small
               last_lines = f.readlines()
               if not last_lines: return None
               last_line = last_lines[-1].decode('utf-8').strip()
               if not last_line: return None
               
               parts = last_line.split(',')
               last_date_str = parts[0] # assuming Date is first col
               
               # If intraday date is definitely OLDER than daily date, skip pandas load
               if last_date_str[:10] < daily_last_date_str[:10]:
                   return None
        except Exception:
            pass

        # Use pandas for easier processing
        df = pd.read_csv(file_path)
        if len(df) == 0: return None
        
        # Ensure Date is datetime
        df['Date'] = pd.to_datetime(df['Date'])
        last_row = df.iloc[-1]
        last_date = last_row['Date']
        last_price = float(last_row['Close'])
        
        # Calculate volume for the "current day" in the intraday file
        # Filter for rows with same date as last_row
        today_mask = df['Date'].dt.date == last_date.date()
        today_vol = df.loc[today_mask, 'Volume'].sum()
        
        return {
            'price': last_price,
            'volume': int(today_vol),
            'date': last_date
        }

    except Exception as e:
        # print(f"Intraday error for {ticker}: {e}")
        return None

def generate_dashboard_data():
    data = []
    
    # Get all csv files
    files = glob.glob(os.path.join(DATA_DIR, '*.csv'))
    print(f"Processing {len(files)} tickers...")
    
    for file_path in files:
        ticker = os.path.splitext(os.path.basename(file_path))[0]
        
        try:
            # Read only last 300 lines (enough for year calc)
            try:
                df = pd.read_csv(file_path)
            except Exception:
                continue
            
            if len(df) < 2:
                continue
                
            last_row = df.iloc[-1]
            last_date_val = last_row['Date']
            last_date_str = str(last_date_val)
            
            # Base data from Daily
            current_price = float(last_row['Close'])
            current_volume = int(last_row['Volume']) if 'Volume' in df else 0
            
            # Check for Intraday update
            intra = get_intraday_data(ticker, last_date_str)
            
            using_intraday = False
            prev_close = float(df.iloc[-2]['Close']) # Default prev_close
            
            if intra:
                daily_dt = pd.to_datetime(last_date_val)
                intra_dt = intra['date']
                
                # If intraday is strictly newer day
                if intra_dt.date() > daily_dt.date():
                    using_intraday = True
                    current_price = intra['price']
                    current_volume = intra['volume']
                    # Previous close is the Last Daily Close (which is yesterday relative to intraday)
                    prev_close = float(last_row['Close'])
                    
                # If same day, prefer intraday for latest price
                elif intra_dt.date() == daily_dt.date():
                    using_intraday = True
                    current_price = intra['price']
                    if intra['volume'] > current_volume:
                        current_volume = intra['volume']
                    # Prev close remains defaults (daily[-2])
            
            
            # Recalculate diffs
            
            # 1 Day Change
            diff_1d = current_price - prev_close
            chg_1d = calculate_change(current_price, prev_close)
            
            # 1 Week Change (Approx 5 trading days)
            chg_1w = 0
            diff_1w = 0
            if len(df) >= 6:
                week_row = df.iloc[-6]
                week_price = float(week_row['Close'])
                diff_1w = current_price - week_price
                chg_1w = calculate_change(current_price, week_price)
            elif len(df) > 0:
                first_row = df.iloc[0]
                week_price = float(first_row['Close'])
                diff_1w = current_price - week_price
                chg_1w = calculate_change(current_price, week_price)

            # 1 Month Change (Approx 21 trading days)
            chg_1m = 0
            diff_1m = 0
            if len(df) >= 22:
                month_row = df.iloc[-22]
                month_price = float(month_row['Close'])
                diff_1m = current_price - month_price
                chg_1m = calculate_change(current_price, month_price)

            # 1 Year Change (Approx 252 trading days)
            chg_1y = 0
            diff_1y = 0
            if len(df) >= 253:
                year_row = df.iloc[-253]
                year_price = float(year_row['Close'])
                diff_1y = current_price - year_price
                chg_1y = calculate_change(current_price, year_price)

            # All Time Change
            chg_all = 0
            diff_all = 0
            if len(df) > 0:
                first_row = df.iloc[0]
                first_price = float(first_row['Close'])
                diff_all = current_price - first_price
                chg_all = calculate_change(current_price, first_price)
            
            # Sparkline (Last 20 records) from Daily is fine
            sparkline = df['Close'].tail(20).tolist()
            
            data.append({
                't': ticker,
                'p': current_price,
                'c1d': round(chg_1d, 2),
                'p1d': round(diff_1d, 2),
                'c1w': round(chg_1w, 2),
                'p1w': round(diff_1w, 2),
                'c1m': round(chg_1m, 2),
                'p1m': round(diff_1m, 2),
                'c1y': round(chg_1y, 2),
                'p1y': round(diff_1y, 2),
                'ca': round(chg_all, 2),
                'pa': round(diff_all, 2),
                'sl': sparkline,
                'v': int(current_volume)
            })
            
        except Exception as e:
            # print(f"Error processing {ticker}: {e}")
            continue

    # Sort by 1 day change descending
    data.sort(key=lambda x: x['c1d'], reverse=True)
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(data, f)
        
    print(f"Dashboard data generated for {len(data)} tickers at {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_dashboard_data()
