import asyncio
import sqlite3
from database import DATABASE_URL

async def migrate_loyalty_policy():
    db_path = DATABASE_URL.replace("sqlite+aiosqlite:///", "")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    print(f"Connecting to {db_path}...")

    # 1. Update Store table with additional policy fields
    columns_to_add = [
        ("point_accrual_type", "VARCHAR DEFAULT 'percent'"),
        ("point_fixed_amount", "INTEGER DEFAULT 0"),
        ("point_review_bonus", "INTEGER DEFAULT 100"),
        ("min_redemption_points", "INTEGER DEFAULT 0"),
        ("max_redemption_per_order", "INTEGER"),
        ("point_expiry_months", "INTEGER DEFAULT 12")
    ]
    
    for col_name, col_def in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE store ADD COLUMN {col_name} {col_def}")
            print(f"Added {col_name} to store table.")
        except sqlite3.OperationalError:
            print(f"{col_name} column already exists in store table.")

    # 2. Update Order table with discount and final price fields
    order_cols = [
        ("discount_amount", "INTEGER DEFAULT 0"),
        ("final_price", "INTEGER DEFAULT 0")
    ]
    for col_name, col_def in order_cols:
        try:
            cursor.execute(f"ALTER TABLE \"order\" ADD COLUMN {col_name} {col_def}")
            print(f"Added {col_name} to order table.")
        except sqlite3.OperationalError:
            print(f"{col_name} column already exists in order table.")

    # 3. Update PointHistory table with related_order_id
    try:
        cursor.execute("ALTER TABLE pointhistory ADD COLUMN related_order_id INTEGER")
        print("Added related_order_id to pointhistory table.")
    except sqlite3.OperationalError:
        print("related_order_id column already exists in pointhistory table.")

    conn.commit()
    conn.close()
    print("Loyalty Policy & Settlement Dashboard migration complete.")

if __name__ == "__main__":
    asyncio.run(migrate_loyalty_policy())
