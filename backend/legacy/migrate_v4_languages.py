import sqlite3
import os

def migrate():
    db_path = "qr_v9.db"
    if not os.path.exists(db_path):
        print(f"Database {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 1. Store table migrations
        cursor.execute("PRAGMA table_info(store)")
        store_cols = [column[1] for column in cursor.fetchall()]
        
        if "supported_languages" not in store_cols:
            print("Adding supported_languages column to store table...")
            cursor.execute("ALTER TABLE store ADD COLUMN supported_languages TEXT DEFAULT 'ja,en,ko,zh'")
        
        # 2. Menu table migrations
        cursor.execute("PRAGMA table_info(menu)")
        menu_cols = [column[1] for column in cursor.fetchall()]
        
        missing_menu_cols = [
            ("name_zh", "TEXT"),
            ("description_zh", "TEXT"),
            ("extra_translations", "TEXT"),
            ("is_active", "BOOLEAN DEFAULT 1"),
            ("is_available", "BOOLEAN DEFAULT 1"),
            ("sold_out_until", "DATETIME"),
            ("sort_order", "INTEGER DEFAULT 0")
        ]
        
        for col_name, col_type in missing_menu_cols:
            if col_name not in menu_cols:
                print(f"Adding {col_name} column to menu table...")
                cursor.execute(f"ALTER TABLE menu ADD COLUMN {col_name} {col_type}")

        conn.commit()
        print("Migration successful.")
            
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
