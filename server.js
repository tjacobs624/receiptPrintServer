// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.text());
app.use(express.static('public'));

const PRINTER_DEVICE = '/dev/usb/lp0';

// Paper tracking constants
const PAPER_STATUS_FILE = path.join(__dirname, 'paper_status.json');
const PAPER_ROLL_LENGTH_MM = 69850; // 230 feet minus ~8 inches for loading
const MM_PER_LINE = 3.5; // Typical thermal printer line height
const MM_PER_JOB_OVERHEAD = 25; // 6 newlines (~21mm) + cut operation (~4mm)

// Paper tracking functions
function loadPaperStatus() {
    try {
        if (fs.existsSync(PAPER_STATUS_FILE)) {
            const data = JSON.parse(fs.readFileSync(PAPER_STATUS_FILE, 'utf8'));
            return data;
        }
    } catch (error) {
        console.error('Error loading paper status:', error);
    }

    // Default: new roll
    return {
        remaining_mm: PAPER_ROLL_LENGTH_MM,
        total_jobs: 0,
        last_reset: new Date().toISOString()
    };
}

function savePaperStatus(status) {
    try {
        fs.writeFileSync(PAPER_STATUS_FILE, JSON.stringify(status, null, 2));
    } catch (error) {
        console.error('Error saving paper status:', error);
    }
}

function calculatePaperUsage(text) {
    const lines = text.split('\n').length;
    return (lines * MM_PER_LINE) + MM_PER_JOB_OVERHEAD;
}

function updatePaperUsage(usageMm) {
    const status = loadPaperStatus();
    status.remaining_mm = Math.max(0, status.remaining_mm - usageMm);
    status.total_jobs += 1;
    savePaperStatus(status);
    return status;
}

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

        // Calculate and track paper usage
        const paperUsageMm = calculatePaperUsage(text);
        const paperStatus = updatePaperUsage(paperUsageMm);

        fs.writeFileSync(PRINTER_DEVICE, escposData);

        res.json({
            status: 'printed',
            length: text.length,
            paper_used_mm: Math.round(paperUsageMm * 10) / 10,
            paper_remaining_mm: Math.round(paperStatus.remaining_mm * 10) / 10,
            paper_remaining_percent: Math.round((paperStatus.remaining_mm / PAPER_ROLL_LENGTH_MM) * 100)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/status', (req, res) => {
    try {
        const exists = fs.existsSync(PRINTER_DEVICE);
        const paperStatus = loadPaperStatus();

        res.json({
            printer_available: exists,
            paper: {
                remaining_mm: Math.round(paperStatus.remaining_mm * 10) / 10,
                remaining_percent: Math.round((paperStatus.remaining_mm / PAPER_ROLL_LENGTH_MM) * 100),
                total_jobs: paperStatus.total_jobs,
                last_reset: paperStatus.last_reset,
                roll_length_mm: PAPER_ROLL_LENGTH_MM
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/paper/reset', (req, res) => {
    try {
        const newStatus = {
            remaining_mm: PAPER_ROLL_LENGTH_MM,
            total_jobs: 0,
            last_reset: new Date().toISOString()
        };
        savePaperStatus(newStatus);

        res.json({
            status: 'paper_reset',
            message: 'New paper roll installed',
            paper: {
                remaining_mm: PAPER_ROLL_LENGTH_MM,
                remaining_percent: 100,
                total_jobs: 0,
                last_reset: newStatus.last_reset
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/paper/adjust', (req, res) => {
    try {
        const { remaining_mm } = req.body;
        if (typeof remaining_mm !== 'number' || remaining_mm < 0 || remaining_mm > PAPER_ROLL_LENGTH_MM) {
            return res.status(400).json({ error: 'Invalid remaining_mm value' });
        }

        const status = loadPaperStatus();
        status.remaining_mm = remaining_mm;
        savePaperStatus(status);

        res.json({
            status: 'paper_adjusted',
            message: `Paper level manually set to ${remaining_mm}mm`,
            paper: {
                remaining_mm: remaining_mm,
                remaining_percent: Math.round((remaining_mm / PAPER_ROLL_LENGTH_MM) * 100),
                total_jobs: status.total_jobs,
                last_reset: status.last_reset
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, '0.0.0.0', () => {
    console.log('Print server listening on port 3000');
});
