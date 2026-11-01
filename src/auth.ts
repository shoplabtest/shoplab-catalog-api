import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { Config } from './config.ts';

/** Claims issued by shoplab-iam. */
export interface AccessClaims {
  sub: string;
  role: 'customer' | 'staff' | 'admin';
  tenant: string;
}

declare module 'express-serve-static-core' {
  interface Request { claims?: AccessClaims }
}

export const requireStaff = (cfg: Config) => (req: Request, res: Response, next: NextFunction) => {
  const h = req.header('authorization');
  if (!h?.startsWith('Bearer ')) return void res.status(401).json({ error: 'unauthorized' });
  try {
    req.claims = jwt.verify(h.slice(7), cfg.jwtSecret) as AccessClaims;
  } catch {
    return void res.status(401).json({ error: 'unauthorized' });
  }
  if (req.claims.role === 'customer') return void res.status(403).json({ error: 'forbidden' });
  next();
};
