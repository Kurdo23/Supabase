import {createClient} from "@supabase/supabase-js";

import {env} from './envConfig'
import {getChallSummary} from "./supabase/functions/challenge-mana/helpers";
async function example1() {
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
            idChallenge: 2,
            name: 'un nom',
            isGlobal: true,
            description: 'un test',
            startDateTime: new Date(),
            endDateTime: new Date(),
            objective: 'un objectif',
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

//example1()

async function example2() {
    const supabaseurl = env.supabaseUrl;
    const supabasekey = env.supabaseAnonKey;

    // Si env.supabaseUrl est seulement "wmqyotlomevvdswmiful"
    const functionUrl = `${supabaseurl}/functions/v1/challenge-mana`
    console.log(functionUrl)

    console.log('🔗 Calling URL:', functionUrl)

    const response = await fetch(`${supabaseurl}/functions/v1/challenge-mana`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${supabasekey}`,
            'Content-Type': 'application/json',
        },
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

//example2()

async function example3(){
    const supabaseurl = env.supabaseUrl;
    const supabasekey = env.supabaseAnonKey;

    const supabase = createClient(supabaseurl, supabasekey);

    const result = await getChallSummary(supabase);

    console.log(result);
}

//xample3()

async function example4() {
    const supabaseurl = env.supabaseUrl;
    const supabasekey = env.supabaseAnonKey;

    // Si env.supabaseUrl est seulement "wmqyotlomevvdswmiful"
    const functionUrl = `${supabaseurl}/functions/v1/groups`
    console.log(functionUrl)

    console.log('🔗 Calling URL:', functionUrl)

    const response = await fetch(`${supabaseurl}/functions/v1/groups`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${supabasekey}`,
            'Content-Type': 'application/json',
        },
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

example4()