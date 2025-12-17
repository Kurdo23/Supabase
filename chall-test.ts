import {createClient} from "@supabase/supabase-js";

import {env} from './envConfig'
import {addChall, deleteChallenge, getChallSummary, updateChallenge} from "./supabase/functions/challenge-mana/helpers";
async function example1() {
    const supabaseurl = env.supabaseUrl;
    const supabasekey = env.supabaseAnonKey;
    const supa = createClient(supabaseurl, supabasekey)
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
            name: 'un nom',
            isGlobal: true,
            description: 'un test',
            startDateTime: new Date().toISOString(),
            endDateTime: new Date().toISOString(),
            objective: 10,
            goal: "un goal",
            isDraft: true,
            isActive: true,
        }),
    })



    if (response.ok) {
        const data = await response.json()
        console.log(data);

    } else {
        const errorText = await response.text()
        console.log('❌ Error response:', errorText)
    }
}

//example1()

async function example2() {
    const supabaseurl = env.supabaseUrl;
    const supabasekey = env.supabaseAnonKey;

    const supabase = createClient(supabaseurl, supabasekey)
    const result = getChallSummary(supabase)


    console.log(result)
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
           console.log('✅ Function response:', data)
           console.log(`📊 Nombre d'utilisateurs: ${data.challSummary.challenges.length}`)

           // Itération avec forEach
           data.challSummary.challenges.forEach((chall, index) => {
               console.log(`👤 Challenge ${index + 1}:`)
               console.log(`   ID: ${chall.idChallenge}`)
               console.log(`   Nom: ${chall.name}`)
               console.log(`   Start time: ${new Date(chall.startDateTime).toLocaleDateString()}`)
               console.log(`   End time: ${new Date(chall.endDateTime).toLocaleDateString('fr-FR')}`)
               console.log('---')
           })

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
    const body = {
        goal: "un goal de changé"
    }
    const result = await updateChallenge(supabase, 13, body);

    console.log(result);
}

//example3()

async function example4(){
    const supabaseurl = env.supabaseUrl;
    const supabasekey = env.supabaseAnonKey;

    const supabase = createClient(supabaseurl, supabasekey);

    const result = await deleteChallenge(supabase, 12);

    console.log(result);
}

//example4()