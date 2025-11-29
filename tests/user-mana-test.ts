import {env } from '../envConfig'


async function callFunction() {
    const supabaseurl = env.supabaseUrl;
    const supabasekey = env.supabaseAnonKey;

    // Si env.supabaseUrl est seulement "wmqyotlomevvdswmiful"
    const functionUrl = `${supabaseurl}/functions/v1/user-mana`
    console.log(functionUrl)

    console.log('🔗 Calling URL:', functionUrl)
    console.log(supabaseurl)
    console.log(supabasekey)
    const response = await fetch(`${supabaseurl}/functions/v1/user-mana`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${supabasekey}`,
            'Content-Type': 'application/json',
        },
    })

    console.log('Status:', response.status)
    console.log('Status Text:', response.statusText)

    if (response.ok) {
        const data = await response.json()
        console.log('✅ Function response:', data)
        console.log(`📊 Nombre d'utilisateurs: ${data.summary.users.length}`)

        // Itération avec forEach
        data.summary.users.forEach((user, index) => {
            console.log(`👤 Utilisateur ${index + 1}:`)
            console.log(`   ID: ${user.idUser}`)
            console.log(`   Nom: ${user.username}`)
            console.log(`   Email: ${user.email}`)
            console.log(`   Avatar: ${user.avatar || 'Aucun'}`)
            console.log('---')
        })

    } else {
        const errorText = await response.text()
        console.log('❌ Error response:', errorText)
    }
}

// Appeler la fonction
callFunction()