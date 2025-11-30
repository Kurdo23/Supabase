import {createClient} from "@supabase/supabase-js";

import {env} from './envConfig'
async function callFunction() {
    const supabaseurl = env.supabaseUrl;
    const supabasekey = env.supabaseAnonKey;

    // Si env.supabaseUrl est seulement "wmqyotlomevvdswmiful"
    const functionUrl = `${supabaseurl}/functions/v1/challenge-mana`
    console.log(functionUrl)

    console.log('🔗 Calling URL:', functionUrl)

    const response = await fetch(`${supabaseurl}/functions/v1/challenge-mana`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${supabasekey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            idChallenge: 1,
            name: "un nom",
            isGlobal: true,
            description: "un test",
            startDateTime: new Date().toISOString(),
            endDateTime: new Date().toISOString(),
            objective: "un objectif",
            isDraft: true,
            isActive: true,
        }),
    })



    if (response.ok) {
        const data = await response.json()
        console.log(data);
        /*   console.log('✅ Function response:', data)
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
           */
    } else {
        const errorText = await response.text()
        console.log('❌ Error response:', errorText)
    }
}

// Appeler la fonction
callFunction()