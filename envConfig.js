import dotenv from 'dotenv';

dotenv.config();

// Validation des variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    throw new Error('Variables d\'environnement Supabase manquantes');
}

export const env = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
};

// Log pour debug (supprimer en production)
console.log('Configuration chargée:', {
    supabaseUrl: env.supabaseUrl ? '✓ Défini' : '✗ Manquant',
    supabaseAnonKey: env.supabaseAnonKey ? '✓ Défini' : '✗ Manquant'
});