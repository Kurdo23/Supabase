
import { env } from './envConfig';
import {createClient} from "@supabase/supabase-js";
import {getCompleteUsersSummary, getUserDetail} from "./supabase/functions/user-mana/helpers";

const supaClient = createClient(env.supabaseUrl, env.supabaseAnonKey)
interface UserStats {
    total: number;
    active: number;
    inactive: number;
    suspended: number;
    lastUpdated: string;
}

interface UserStatsResponse {
    stats: UserStats | null;
    error: string | null;
    success: boolean;
}

async function print(){
    const result = await getCompleteUsersSummary(supaClient, 1, 2);

    if (result.success && result.summary) {
        console.log('📊 STATISTIQUES:');
        console.log(`Total: ${result.summary.stats.total}`);
        console.log(`Actifs: ${result.summary.stats.active}`);
        console.log(`Inactifs: ${result.summary.stats.inactive}`);
        console.log(`Suspendus: ${result.summary.stats.suspended}`);

        console.log('\n👥 UTILISATEURS (page 1):');
        result.summary.users.forEach(user => {
            console.log(`- ${user.idUser} (@${user.username}) - ${user.isSoftDelete}`);
        });

        console.log('\n📄 PAGINATION:');
        console.log(`Page ${result.summary.pagination.currentPage}/${result.summary.pagination.totalPages}`);
        console.log(`A plus de pages: ${result.summary.pagination.hasMore}`);
    }
}



async function exemple2() {

    let page = 1;
    let continuer = true;

    while (continuer) {
        const result = await getCompleteUsersSummary(supaClient, page, 2);

        if (!result.success || !result.summary) {
            console.error('Erreur:', result.error);
            break;
        }

        console.log(`\n📄 Page ${page}:`);
        console.log(`${result.summary.users.length} utilisateurs sur cette page`);

        // Afficher les stats une seule fois
        if (page === 1) {
            console.log('\n📊 Statistiques globales:');
            console.log(`Total: ${result.summary.stats.total}`);
            console.log(`Actifs: ${result.summary.stats.active}`);
        }

        if (result.summary.pagination.hasMore) {
            page++;
        } else {
            continuer = false;
            console.log('\n✅ Toutes les pages récupérées');
        }
    }
}

async function getDetail(){
    const id  = await supaClient.from("User").select('idUser').eq('name', 'Zurel').single();
    const idUser = id.data.idUser as string;

    const result = await getUserDetail(supaClient, idUser);
    console.log(result);
}

getDetail();
/* const result = await getUsersStatsDetailed(supaClient);

    if (result.success && result.stats && result.percentages) {
        console.log('📊 Statistiques détaillées:');
        console.log(`Actifs: ${result.stats.active} (${result.percentages.active}%)`);
        console.log(`Inactifs: ${result.stats.inactive} (${result.percentages.inactive}%)`);
        console.log(`Suspendus: ${result.stats.suspended} (${result.percentages.suspended}%)`);
    }*/