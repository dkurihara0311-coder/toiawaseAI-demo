import os
from supabase import create_client, Client

class StorageService:
    def __init__(self):
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if url and key:
            self.supabase: Client = create_client(url, key)
            self.bucket_name = "documents"
        else:
            self.supabase = None

    def upload_file(self, file_path: str, remote_path: str):
        """Upload a local file to Supabase Storage."""
        if not self.supabase:
            print("ERROR: Supabase Storage not configured.")
            return False
            
        with open(file_path, 'rb') as f:
            try:
                self.supabase.storage.from_(self.bucket_name).upload(
                    path=remote_path,
                    file=f,
                    file_options={"cache-control": "3600", "upsert": "true"}
                )
                return True
            except Exception as e:
                print(f"ERROR: Supabase upload failed: {e}")
                return False

    def download_file(self, remote_path: str, local_path: str):
        """Download a file from Supabase Storage to a local temp path."""
        if not self.supabase:
            return False
            
        try:
            with open(local_path, 'wb+') as f:
                res = self.supabase.storage.from_(self.bucket_name).download(remote_path)
                f.write(res)
            return True
        except Exception as e:
            print(f"ERROR: Supabase download failed: {e}")
            return False

storage_service = StorageService()
