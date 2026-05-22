import sqlite3

def migrate():
    try:
        conn = sqlite3.connect('qr_v6.db')
        cursor = conn.cursor()
        
        # Check if column exists
        cursor.execute("PRAGMA table_info(store)")
        columns = [info[1] for info in cursor.fetchall()]
        
        if 'theme' not in columns:
            print("Adding 'theme' column to 'store' table...")
            cursor.execute("ALTER TABLE store ADD COLUMN theme TEXT DEFAULT 'modern'")
            conn.commit()
            print("Migration successful.")
        else:
            print("'theme' column already exists.")
            
        conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
