// logger.js
export const Logger = {
    info: (msg, data = "") => console.log(`%c[INFO] ${msg}`, 'color: #3B82F6; font-weight: bold;', data),
    success: (msg, data = "") => console.log(`%c[SUCCESS] ${msg}`, 'color: #10B981; font-weight: bold;', data),
    warn: (msg, data = "") => console.warn(`%c[WARN] ${msg}`, 'color: #F59E0B; font-weight: bold;', data),
    error: (msg, data = "") => console.error(`%c[ERROR] ${msg}`, 'color: #EF4444; font-weight: bold;', data),
    debug: (msg, data = "") => console.log(`%c[DEBUG] ${msg}`, 'color: #6B7280; font-style: italic;', data),

    divider: () => console.log(`%c------------------------------------------------`, 'color: #D1D5DB;')
};