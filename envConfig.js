import dotenv from 'dotenv'


dotenv.config() // get the .env config

//env const created to be used throughout the project
export const env = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
}
