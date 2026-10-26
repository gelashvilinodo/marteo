'use client';
import { createContext, useContext } from 'react';
import type { BusinessMode } from '@/lib/business/business-mode';
export const BusinessModeContext=createContext<BusinessMode>('IMPORT');
export const useBusinessMode=()=>useContext(BusinessModeContext);
