const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Database file paths
const DB_FILE = path.join(__dirname, 'database.json');
const LOGS_DIR = path.join(__dirname, 'logs');

// Admin credentials
const ADMIN_USERNAME = 'admin999';
const ADMIN_PASSWORD = 'admin888';

// Đảm bảo thư mục logs tồn tại
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR);
}

// Đảm bảo file database tồn tại
if (!fs.existsSync(DB_FILE)) {
    const initialData = {
        keys: [],
        logs: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
}

// Helper functions
function readDatabase() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading database:', error);
        return { keys: [], logs: [] };
    }
}

function writeDatabase(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error writing database:', error);
        return false;
    }
}

function addLog(action, key = null, details = '') {
    try {
        const db = readDatabase();
        const logEntry = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            action,
            key,
            details
        };
        
        db.logs.push(logEntry);
        
        // Giữ tối đa 1000 logs
        if (db.logs.length > 1000) {
            db.logs = db.logs.slice(-1000);
        }
        
        writeDatabase(db);
        
        // Ghi log vào file riêng
        const logFile = path.join(LOGS_DIR, `${new Date().toISOString().split('T')[0]}.log`);
        const logMessage = `${logEntry.timestamp} - ${action} - Key: ${key || 'N/A'} - ${details}\n`;
        fs.appendFileSync(logFile, logMessage, 'utf8');
        
    } catch (error) {
        console.error('Error adding log:', error);
    }
}

// Middleware kiểm tra key
async function checkKeyMiddleware(req, res, next) {
    const { key } = req.body;
    
    if (!key) {
        addLog('API_ACCESS_DENIED', null, 'Missing key in request');
        return res.status(400).json({
            status: 'error',
            message: 'Thiếu key trong request'
        });
    }
    
    const db = readDatabase();
    const foundKey = db.keys.find(k => k.key === key);
    
    if (!foundKey) {
        addLog('API_ACCESS_DENIED', key, 'Invalid key');
        return res.status(401).json({
            status: 'error',
            message: 'Key không hợp lệ'
        });
    }
    
    // Kiểm tra hạn sử dụng
    const now = new Date();
    const expiryDate = new Date(foundKey.het_han);
    
    if (now > expiryDate) {
        addLog('API_ACCESS_DENIED', key, 'Expired key');
        return res.status(401).json({
            status: 'error',
            message: 'Key đã hết hạn'
        });
    }
    
    addLog('API_ACCESS_GRANTED', key, `Accessed ${req.path}`);
    next();
}

// Middleware kiểm tra admin
function adminMiddleware(req, res, next) {
    const { username, password } = req.query;
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        addLog('ADMIN_LOGIN_SUCCESS', null, `Username: ${username}`);
        next();
    } else {
        addLog('ADMIN_LOGIN_FAILED', null, `Username: ${username}`);
        return res.status(401).json({
            status: 'error',
            message: 'Thông tin đăng nhập không chính xác'
        });
    }
}

// API kiểm tra key
app.post('/checkkey', (req, res) => {
    const { key } = req.body;
    
    if (!key) {
        return res.status(400).json({
            status: 'error',
            message: 'Vui lòng cung cấp key'
        });
    }
    
    const db = readDatabase();
    const foundKey = db.keys.find(k => k.key === key);
    
    if (!foundKey) {
        addLog('KEY_CHECK_FAILED', key, 'Key not found');
        return res.json({
            status: 'error',
            message: 'Key không tồn tại'
        });
    }
    
    // Kiểm tra hạn sử dụng
    const now = new Date();
    const expiryDate = new Date(foundKey.het_han);
    
    if (now > expiryDate) {
        addLog('KEY_CHECK_FAILED', key, 'Key expired');
        return res.json({
            status: 'error',
            message: 'Key đã hết hạn',
            key: foundKey.key,
            het_han: foundKey.het_han,
            trang_thai: 'expired'
        });
    }
    
    addLog('KEY_CHECK_SUCCESS', key, 'Key valid');
    return res.json({
        status: 'success',
        message: 'Key hợp lệ',
        key: foundKey.key,
        het_han: foundKey.het_han,
        trang_thai: 'active'
    });
});

// API trung gian - Sunwin
app.post('/sunwin', checkKeyMiddleware, async (req, res) => {
    try {
        const response = await axios.post('https://check-api-xqys.onrender.com/sunwin', req.body);
        
        addLog('SUNWIN_API_CALL', req.body.key, 'Success');
        
        res.json({
            status: 'success',
            data: response.data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        addLog('SUNWIN_API_ERROR', req.body.key, error.message);
        
        res.status(500).json({
            status: 'error',
            message: 'Lỗi khi gọi API Sunwin',
            error: error.message
        });
    }
});

// API trung gian - LC79
app.post('/lc79', checkKeyMiddleware, async (req, res) => {
    try {
        const response = await axios.post('https://check-api-xqys.onrender.com/lc79', req.body);
        
        addLog('LC79_API_CALL', req.body.key, 'Success');
        
        res.json({
            status: 'success',
            data: response.data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        addLog('LC79_API_ERROR', req.body.key, error.message);
        
        res.status(500).json({
            status: 'error',
            message: 'Lỗi khi gọi API LC79',
            error: error.message
        });
    }
});

// ==================== ADMIN API ====================

// API đăng nhập admin
app.get('/admin', (req, res) => {
    const { username, password } = req.query;
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        addLog('ADMIN_LOGIN_SUCCESS', null, 'Login successful');
        return res.json({
            status: 'success',
            message: 'Đăng nhập thành công',
            timestamp: new Date().toISOString()
        });
    } else {
        addLog('ADMIN_LOGIN_FAILED', null, 'Invalid credentials');
        return res.status(401).json({
            status: 'error',
            message: 'Thông tin đăng nhập không chính xác'
        });
    }
});

// API tạo key (chỉ admin)
app.get('/taokey', adminMiddleware, (req, res) => {
    const { thoigian, soluong } = req.query;
    
    if (!thoigian || !soluong) {
        return res.status(400).json({
            status: 'error',
            message: 'Thiếu tham số thoigian hoặc soluong'
        });
    }
    
    const timeInDays = parseInt(thoigian);
    const quantity = parseInt(soluong);
    
    if (isNaN(timeInDays) || isNaN(quantity) || timeInDays <= 0 || quantity <= 0) {
        return res.status(400).json({
            status: 'error',
            message: 'Tham số thoigian và soluong phải là số dương'
        });
    }
    
    if (quantity > 100) {
        return res.status(400).json({
            status: 'error',
            message: 'Số lượng key tối đa là 100'
        });
    }
    
    const db = readDatabase();
    const createdKeys = [];
    
    for (let i = 0; i < quantity; i++) {
        const key = generateKey();
        const now = new Date();
        const expiryDate = new Date(now.getTime() + (timeInDays * 24 * 60 * 60 * 1000));
        
        const keyData = {
            key: key,
            het_han: expiryDate.toISOString(),
            created_at: now.toISOString(),
            created_by: 'admin'
        };
        
        db.keys.push(keyData);
        createdKeys.push({
            key: keyData.key,
            het_han: keyData.het_han
        });
        
        addLog('KEY_CREATED', key, `Expires: ${keyData.het_han}`);
    }
    
    writeDatabase(db);
    
    res.json({
        status: 'success',
        message: `Đã tạo ${quantity} key thành công`,
        keys: createdKeys,
        timestamp: new Date().toISOString()
    });
});

// API xóa key (chỉ admin)
app.get('/xoakey', adminMiddleware, (req, res) => {
    const { key } = req.query;
    
    if (!key) {
        return res.status(400).json({
            status: 'error',
            message: 'Thiếu tham số key'
        });
    }
    
    const db = readDatabase();
    const keyIndex = db.keys.findIndex(k => k.key === key);
    
    if (keyIndex === -1) {
        addLog('KEY_DELETE_FAILED', key, 'Key not found');
        return res.status(404).json({
            status: 'error',
            message: 'Key không tồn tại'
        });
    }
    
    // Xóa key
    const deletedKey = db.keys.splice(keyIndex, 1)[0];
    writeDatabase(db);
    
    addLog('KEY_DELETED', key, 'Key deleted successfully');
    
    res.json({
        status: 'success',
        message: 'Xóa key thành công',
        deleted_key: deletedKey.key,
        timestamp: new Date().toISOString()
    });
});

// API danh sách key (chỉ admin)
app.get('/listkey', adminMiddleware, (req, res) => {
    const db = readDatabase();
    
    // Tính trạng thái cho mỗi key
    const keysWithStatus = db.keys.map(key => {
        const now = new Date();
        const expiryDate = new Date(key.het_han);
        const isExpired = now > expiryDate;
        
        return {
            ...key,
            trang_thai: isExpired ? 'expired' : 'active',
            con_lai: isExpired ? '0 ngày' : calculateRemainingDays(expiryDate, now)
        };
    });
    
    addLog('KEY_LIST_VIEWED', null, `Total keys: ${keysWithStatus.length}`);
    
    res.json({
        status: 'success',
        total_keys: keysWithStatus.length,
        keys: keysWithStatus,
        timestamp: new Date().toISOString()
    });
});

// API xem logs (chỉ admin)
app.get('/log', adminMiddleware, (req, res) => {
    const db = readDatabase();
    
    // Sắp xếp logs theo thời gian mới nhất
    const sortedLogs = [...db.logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Giới hạn trả về 100 logs mới nhất
    const recentLogs = sortedLogs.slice(0, 100);
    
    addLog('LOGS_VIEWED', null, 'Admin viewed logs');
    
    res.json({
        status: 'success',
        total_logs: db.logs.length,
        recent_logs: recentLogs,
        timestamp: new Date().toISOString()
    });
});

// Helper functions
function generateKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    
    // Tạo key dạng: XXXX-XXXX-XXXX-XXXX
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) {
            key += '-';
        }
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return key;
}

function calculateRemainingDays(expiryDate, currentDate) {
    const diffTime = expiryDate - currentDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? `${diffDays} ngày` : '0 ngày';
}

// Route mặc định
app.get('/', (req, res) => {
    res.json({
        message: 'API Trung Gian đang hoạt động',
        endpoints: {
            user: {
                'POST /checkkey': 'Kiểm tra key',
                'POST /sunwin': 'API Sunwin (cần key)',
                'POST /lc79': 'API LC79 (cần key)'
            },
            admin: {
                'GET /admin': 'Đăng nhập admin',
                'GET /taokey': 'Tạo key mới',
                'GET /xoakey': 'Xóa key',
                'GET /listkey': 'Danh sách key',
                'GET /log': 'Xem logs'
            }
        },
        admin_credentials: {
            username: ADMIN_USERNAME,
            password: ADMIN_PASSWORD
        },
        timestamp: new Date().toISOString()
    });
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy trên port ${PORT}`);
    console.log(`Truy cập: http://localhost:${PORT}`);
    console.log(`Admin username: ${ADMIN_USERNAME}`);
    console.log(`Admin password: ${ADMIN_PASSWORD}`);
    addLog('SERVER_STARTED', null, `Server started on port ${PORT}`);
});