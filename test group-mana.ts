import {createClient} from "@supabase/supabase-js";
import {
    formatPoints,
    getCompleteGroupSummary,
    getGroupDetail, permanentelyDeleteGroup,
    softDeleteGroup
} from "./supabase/functions/group-mana/helpers";
import {env} from './envConfig'
async function exemple1() {
    const supabaseurl = env.supabaseUrl ;
    const supabasekey = env.supabaseAnonKey ;
    const supabase = createClient(supabaseurl, supabasekey);


    const result = await getCompleteGroupSummary(supabase, 1, 20);

    if (result.success && result.summary) {
        console.log('📊 STATISTIQUES:');
        console.log(`Total groupes: ${result.summary.stats.totalGroups}`);
        console.log(`Groupes actifs: ${result.summary.stats.activeGroups}`);
        console.log(`Groupes inactifs: ${result.summary.stats.inactiveGroups}`);
        console.log(`Total membres: ${result.summary.stats.totalMembers}`);
        console.log(`Points totaux: ${formatPoints(result.summary.stats.totalPoints)}`);

        console.log('\n👥 GROUPES (page 1):');
        result.summary.groups.forEach(group => {
            console.log(group.name)
            console.log(group.logo)
           // console.log(`- ${group.name} (${group.member_count} membres) - Admin: ${group.admin_name}`);
        });
    }
}
//exemple1()

async function exemple2() {
    const supabaseurl = env.supabaseUrl ;
    const supabasekey = env.supabaseAnonKey ;
    const supabase = createClient(supabaseurl, supabasekey);


    const result = await getGroupDetail(supabase, 15);

    if (result.success && result.group) {
        console.log('📊 Détail groupe:');
        console.log(`id du group: ${result.group.idGroup}`);
        console.log(`nom du groupe: ${result.group.name}`);
        console.log(`description: ${result.group.description}`);
        console.log(`logo: ${result.group.logo}`);
        console.log(`reste: ${result.group.isOpen}, ${result.group.isSoftDelete}`);


    }
}
//exemple2();
async function exemple3() {
    const supabaseurl = env.supabaseUrl ;
    const supabasekey = env.supabaseAnonKey ;
    const supabase = createClient(supabaseurl, supabasekey);


    const result = await softDeleteGroup(supabase, 15);

    if (result.success && result.data) {
        console.log(JSON.stringify(result.data))
    }
}
//exemple3()
async function exemple4() {
    const supabaseurl = env.supabaseUrl ;
    const supabasekey = env.supabaseAnonKey ;
    const supabase = createClient(supabaseurl, supabasekey);


    const result = await permanentelyDeleteGroup(supabase, 56);

    if (result.success && result.response) {
        console.log(result.data)
        console.log(result.response)
    }
}
exemple4();