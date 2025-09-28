// server.js
const express = require('express');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.text());

const PRINTER_DEVICE = '/dev/usb/lp0';

function createESCPOS(text) {
    const ESC = '\x1b';
    const GS = '\x1d';
    
    return Buffer.concat([
        Buffer.from(`${ESC}@`),        // Initialize
        Buffer.from(text),             // Content
        Buffer.from('\n\n\n\n\n\n'),  // Feed paper
        Buffer.from(`${GS}V\x00`)     // Cut paper
    ]);
}

app.post('/print', (req, res) => {
    try {
        const text = typeof req.body === 'string' ? req.body : req.body.text;
        const escposData = createESCPOS(text);
        
        fs.writeFileSync(PRINTER_DEVICE, escposData);
        
        res.json({ status: 'printed', length: text.length });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/status', (req, res) => {
    try {
        const exists = fs.existsSync(PRINTER_DEVICE);
        res.json({ printer_available: exists });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, '0.0.0.0', () => {
    console.log('Print server listening on port 3000');
});
