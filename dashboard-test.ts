import {getDashboardSummary} from "./supabase/functions/general-info-admin/helpers";
import {createClient} from "@supabase/supabase-js";
import {readEnv} from "../../AppData/Local/deno/npm/registry.npmjs.org/openai/4.104.0/core";
import {env } from './envConfig'

async function example1(){
    const supabaseurl = env.supabaseUrl;
    const supabaseAnonKye = env.supabaseAnonKey;
    const supabaseClient = createClient(supabaseurl, supabaseAnonKye);
    const response = await getDashboardSummary(supabaseClient);

    if (response.success && response.stats) {
        console.log('Total utilisateurs:', response.stats.users.total);
        console.log('Actifs aujourd\'hui:', response.stats.users.activeToday);
        console.log('Challenges:', response.stats.challenges);
        console.log('Par mois:', response.stats.usersByMonth);
    }
    const now = new Date();
    const startOfTodayISO =new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
    ));
    console.log(activeToday)
    const { count: activeToday, error: activeTodayError } = await supabase
        .from('User')
        .select('*', { count: 'exact', head: true })
        .is('isSoftDelete', false)
        .gte('last_sign_in_at', startOfTodayISO);

    console.log(activeToday);
}

//example1();

async function example2(){
    const supabaseurl = env.supabaseUrl;
    const supabaseAnonKye = env.supabaseAnonKey;

    const response = await fetch(`${supabaseurl}/functions/v1/general-info-admin`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${supabaseAnonKye}`,
            'Content-Type': 'application/json',
        },
    })

    const data = await response.json();
    console.log(data);
   /* const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
    for(let i = 0; i < 10; i++){
        const startTime = Date.now();
        const { data, error } = await supabase.functions.invoke('general-info-admin', {
            method: "GET"
        })
        const endTime = Date.now();
        const totalTime = endTime-startTime;

       // console.log(data);
       // console.log('---');
        if (error) {
            console.error(`Request ${i + 1} failed:`, error, `(${totalTime}ms)`);
        } else {
            console.log(`Request ${i + 1}:`, data, `(${totalTime}ms)`);
        }
        console.log('==========')

    }*/
}

example2()

async function concurrentCalls(){
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
    const supabaseurl = env.supabaseUrl;
    const supabaseAnonKye = env.supabaseAnonKey;
    const concurrentUsers = 100;
    const staggerDelayMs = 100; // 100ms between each user starting

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const requests = Array.from({ length: concurrentUsers }, async (_, i) => {
        await sleep(i * staggerDelayMs); // Stagger the start times

        const startTime = Date.now();
        const response= await fetch(`${supabaseurl}/functions/v1/general-info-admin`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${supabaseAnonKye}`,
                'Content-Type': 'application/json',
            },
        })
        const data = await response.json();
        const endTime = Date.now();

        return { userId: i + 1, data, totalTime: endTime - startTime };
    });

    const results = await Promise.all(requests);
    console.log(results);
}

//concurrentCalls();