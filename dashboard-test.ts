import {getDashboardStats} from "./supabase/functions/general-info-admin/helpers";
import {createClient} from "@supabase/supabase-js";
import {readEnv} from "../../AppData/Local/deno/npm/registry.npmjs.org/openai/4.104.0/core";
import {env } from './envConfig'

async function example1(){
    const supabaseurl = env.supabaseUrl;
    const supabaseAnonKye = env.supabaseAnonKey;
    const supabaseClient = createClient(supabaseurl, supabaseAnonKye);
    const response = await getDashboardStats(supabaseClient);

    if (response.success && response.stats) {
        console.log('Total utilisateurs:', response.stats.users.total);
        console.log('Actifs aujourd\'hui:', response.stats.users.activeToday);
        console.log('Challenges:', response.stats.challenges);
        console.log('Par mois:', response.stats.usersByMonth);
    }
}

//example1();

async function example2(){
    const supabaseurl = env.supabaseUrl;
    const supabaseAnonKye = env.supabaseAnonKey;

    const response = await fetch(`${supabaseurl}/functions/v1/challenge-mana`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${supabaseAnonKye}`,
            'Content-Type': 'application/json',
        },
    })
}