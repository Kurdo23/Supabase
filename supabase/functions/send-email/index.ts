import "jsr:@supabase/functions-js/edge-runtime.d.ts"
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

console.log("Hello from Functions!")

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const handler = async (_request: Request): Promise<Response> => {
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
            from: 'onboarding@resend.dev', // TODO change with params
            to: 'delivered@resend.dev', // TODO change with params
            subject: 'hello world', // Todo change with params
            html: '<strong>it works!</strong>', // TODO do something fancy
        }),
    })

    const data = await res.json()

    return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
        },
    })
}

Deno.serve(handler)
