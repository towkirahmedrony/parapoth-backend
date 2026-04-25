import { Request } from 'express';

export const extractIp = (req: Request): string => {
    const ip = req.ip || req.socket.remoteAddress || req.headers['x-real-ip'] || 'unknown';
    return Array.isArray(ip) ? ip[0] : String(ip).trim();
};
