# server.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os

app = FastAPI()

PRINTER_DEVICE = "/dev/usb/lp0"

class PrintRequest(BaseModel):
    text: str

def create_escpos(text: str) -> bytes:
    ESC = b'\x1b'
    GS = b'\x1d'
    
    return (ESC + b'@' +           # Initialize
            text.encode('utf-8') + # Content  
            b'\n\n\n\n\n\n' +     # Feed paper
            GS + b'V\x00')        # Cut paper

@app.post("/print")
async def print_text(request: PrintRequest):
    try:
        escpos_data = create_escpos(request.text)
        
        with open(PRINTER_DEVICE, 'wb') as f:
            f.write(escpos_data)
            
        return {"status": "printed", "length": len(request.text)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/status") 
async def get_status():
    try:
        exists = os.path.exists(PRINTER_DEVICE)
        return {"printer_available": exists}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
