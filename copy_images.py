import os
import shutil

# Source directory (Artifacts)
SOURCE_DIR = r"C:\Users\ilhae\.gemini\antigravity\brain\ad2b5bcf-f0b6-4e5c-86fa-d15dd1c84e89"
# Destination directory
DEST_DIR = r"f:\myproject\orderservice\frontend\public\images"

# Mapping: Artifact Filename -> Destination Filename
FILES_TO_COPY = {
    "udon_basic_1771454405078.png": "udon_basic.png",
    "udon_beef_1771454421736.png": "udon_beef.png",
    "tempura_assorted_1771454258289.png": "tempura_assorted.png",
    "inari_sushi_1771454280501.png": "inari_sushi.png",
    "udon_basic_1771454405078.png": "drink.png" # Reusing basic udon as placeholder
}

def main():
    print(f"Ensuring directory exists: {DEST_DIR}")
    if not os.path.exists(DEST_DIR):
        try:
            os.makedirs(DEST_DIR)
            print("Directory created.")
        except OSError as e:
            print(f"Error creating directory: {e}")
            return
    else:
        print("Directory already exists.")

    print("Copying files...")
    for src_name, dest_name in FILES_TO_COPY.items():
        src_path = os.path.join(SOURCE_DIR, src_name)
        dest_path = os.path.join(DEST_DIR, dest_name)
        
        if os.path.exists(src_path):
            try:
                shutil.copy2(src_path, dest_path)
                print(f"Copied: {src_name} -> {dest_name}")
            except Exception as e:
                print(f"Failed to copy {src_name}: {e}")
        else:
            print(f"Source file not found: {src_path}")

if __name__ == "__main__":
    main()
