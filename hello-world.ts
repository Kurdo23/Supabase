import { createClient } from '@supabase/supabase-js'
import { env } from './utils/envConfig'


const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey)

async function callFunction() {
    const { data, error } = await supabase.functions.invoke('hello-world', {
        body: { name: 'Functions' } //Change functions by whatever you feel like to get the right message"
    })

    if (error) {
        console.error('Error:', error)
        return
    }

    console.log('Success:', data)
    return data
}

// Appeler la fonction
callFunction()