import asyncio
from app.services.email_fetcher import fetch_recent_emails
from app.rag_pipeline import process_and_store_document
from app.main import SessionLocal

async def main():
    db = SessionLocal()
    try:
        print("Fetching recent emails...")
        emails = fetch_recent_emails(limit=5)
        print(f"Fetched {len(emails)} emails.")
        
        for subject, eml_bytes in emails:
            print(f"Processing: {subject}")
            file_name = f"{subject}.eml"
            await process_and_store_document(db, eml_bytes, file_name, "email")
            
        print("Done processing.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
