import {createClient} from "@supabase/supabase-js";
import {formatPoints, getCompleteGroupSummary} from "../group-mana/helpers";




/**
 * Exemple 1: Récupération simple avec stats
 */
/*async function exemple1() {
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
            console.log(`- ${group.name} (${group.member_count} membres) - Admin: ${group.admin_name}`);
        });
    }
}
exemple1()*/
/**
 * Exemple 2: Recherche et filtrage
 */
async function exemple2() {
    const supabase = createClient('YOUR_URL', 'YOUR_KEY');

    // Rechercher uniquement les groupes actifs de type "famille"
    const result = await getCompleteGroupSummary(
        supabase,
        1,
        20,
        'active',
        'family',
        'Lyon' // Rechercher "Lyon" dans nom ou description
    );

    if (result.success && result.summary) {
        console.log(`Trouvé ${result.summary.groups.length} groupes familiaux actifs avec "Lyon"`);
    }
}