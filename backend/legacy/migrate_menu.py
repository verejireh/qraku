import asyncio
import sqlite3
from pathlib import Path

def migrate_db():
    print("Starting Menu Schema Migration...")
    db_paths = Path(__file__).parent.glob("qr_v*.db")
    
    for db_path in db_paths:
        print(f"Migrating {db_path.name}...")
        try:
            conn = sqlite3.connect(str(db_path))
            cursor = conn.cursor()
            
            # Check if columns already exist
            cursor.execute("PRAGMA table_info(menu)")
            columns = [col[1] for col in cursor.fetchall()]
            
            if "sold_out_until" not in columns:
                cursor.execute("ALTER TABLE menu ADD COLUMN sold_out_until DATETIME")
                print(f" - Added sold_out_until to {db_path.name}")
            
            if "sort_order" not in columns:
                cursor.execute("ALTER TABLE menu ADD COLUMN sort_order INTEGER DEFAULT 0")
                # Pre-populate sort_order with current id to keep default stability
                cursor.execute("UPDATE menu SET sort_order = id")
                print(f" - Added sort_order to {db_path.name}")
                
            conn.commit()
            conn.close()
            print(f"Successfully migrated {db_path.name}")
        except Exception as e:
            print(f"Failed to migrate {db_path.name}: {e}")

if __name__ == "__main__":
    migrate_db()
