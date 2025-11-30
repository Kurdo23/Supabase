import { SupabaseClient } from "@supabase/supabase-js";

// TODO ask if participants per challenge is required or not
export async function getCompleteChallSummary(
  supabase: SupabaseClient,
  page: number = 1,
  pageSize: number = 20,
): Promise<CompleteChallResponse> {
}

export async function getChallSummary(
  supabase: SupabaseClient,
  idChall: number,
): Promise<CompleteResponse> {
  try {
    //Défis globals totaux
    const { count: totalCount, error: totalError } = await supabase
      .from("Challenge")
      .select("*", { count: "exact", head: true })
      .is("isGlobal", true);

    if (totalError) throw new Error(`Erreur total: ${totalError.message}`);

    // Nombre de défis globals en brouillon

    const { count: draftCount, error: draftError } = await supabase
      .from("Challenge")
      .select("*", { count: "exact", head: true })
      .is("isGlobal", true)
      .is("isDraft", true);

    if (draftError) {
      throw new Error(`Erreur brouillons totaux: ${draftError.message}`);
    }
    // Stock data des stats
    const stats: ChallStats = {
      totalCount: totalCount,
      totalDraftCount: draftCount,
    };

    // Récupérer les challenges
    const { challenges, error: challError } = await supabase
      .from("Challenge")
      .select("*")
      .is("isGlobal", true);

    if (challError) {
      throw new Error(`Erreur lors du fetch des défis: ${challError.message}`);
    }

    // Stock data
    const challs: ChallDetail[] = (challenges || []).map((chall: any) => ({
      idChall: chall.idChall,
      name: chall.name,
      isGlobal: chall.isGlobal,
      description: chall.description,
      startDateTime: chall.startDateTime,
      endDateTime: chall.endDateTime,
      objective: chall.objective,
      isDraft: chall.isDraft,
      isActive: chall.isActive,
    }));

    const challSummary: ChallSummary = {
      stats: stats,
      challenges: challs,
    };

    return {
      challSummary,
      error: null,
      success: true,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    console.error(
      "Erreur lors de la récupération complète des groupes:",
      errorMessage,
    );

    return {
      summary: null,
      error: errorMessage,
      success: false,
    };
  }
}

export async function addChall(
  supabase: SupabaseClient,
  newChall: {
      idChallenge: number
      name?: string;
      isGlobal: boolean
      description?: string;
      startDateTime: string;
      endDateTime: string;
      objective: string;
      isDraft: boolean;
      isActive: boolean;
  }
): Promise<CompleteResponse> {
  try {
      // Insérer le nouveau challenge
      const { data: challData, error: insertError } = await supabase
          .from("Challenge")
          .insert({
              idChallenge: newChall.idChallenge,
              name: newChall.name,
              description: newChall.description,
              objective: newChall.objective,
              isActive: newChall.isActive ?? false,
              isDraft: newChall.isDraft ?? true,
              isGlobal: newChall.isGlobal ?? true,
              startDateTime: newChall.startDateTime ?? null,
              endDateTime: newChall.endDateTime ?? null,
          })
          .select()
          .single();

      if (insertError) {
          throw new Error(`Erreur lors de la création: ${insertError.message}`);
      }

      return {
          data: newChall,
          error: null,
          success: true,
      };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    console.error(
      "Erreur lors de la récupération complète des groupes:",
      errorMessage,
    );

    return {
      summary: null,
      error: errorMessage,
      success: false,
    };
  }
}

export async function updateChallenge(
  supabase: SupabaseClient,
  idChall: number,
  updateData: {
      name?: string;
      isGlobal: boolean
      description?: string;
      startDateTime: string;
      endDateTime: string;
      objective: string;
      isDraft: boolean;
      isActive: boolean;
  }
): Promise<CompleteResponse> {
  try {
      // Mettre à jour le challenge
      const { data: updatedChall, error: updateError } = await supabase
          .from("Challenge")
          .update({
              ...(updateData.name !== undefined && { name: updateData.name }),
              ...(updateData.isGlobal !== undefined && { isGlobal: updateData.isGlobal }),
              ...(updateData.description !== undefined && { description: updateData.description }),
              ...(updateData.startDateTime !== undefined && { startDateTime: updateData.startDateTime }),
              ...(updateData.endDateTime !== undefined && { endDateTime: updateData.endDateTime }),
              ...(updateData.objective !== undefined && { objective: updateData.objective }),
              ...(updateData.isDraft !== undefined && { isDraft: updateData.isDraft }),
              ...(updateData.isActive !== undefined && { isActive: updateData.isActive }),
          })
          .eq("idChall", idChall)
          .select()
          .single();

      if (updateError) {
          throw new Error(`Erreur lors de la mise à jour: ${updateError.message}`);
      }

      return {
          data: updatedChall,
          error: null,
          success: true,
      }

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    console.error(
      "Erreur lors de la récupération complète des groupes:",
      errorMessage,
    );

    return {
      summary: null,
      error: errorMessage,
      success: false,
    };
  }
}

export async function deleteChallenge(
  supabase: SupabaseClient,
  idChall: number,
): Promise<CompleteResponse> {
  try {
      // Supprimer le challenge
      const { error: deleteError } = await supabase
          .from("Challenge")
          .delete()
          .eq("idChall", idChall);

      if (deleteError) {
          throw new Error(`Erreur lors de la suppression: ${deleteError.message}`);
      }

      return {
          data: { idChall, deleted: true },
          error: null,
          success: true,
      };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erreur inconnue";
    console.error(
      "Erreur lors de la récupération complète des groupes:",
      errorMessage,
    );

    return {
      summary: null,
      error: errorMessage,
      success: false,
    };
  }
}
