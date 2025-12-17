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
): Promise<CompleteResponse> {
  try {
      console.log("I'm in the chall summary function")
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
    const query= await supabase
      .from('Challenge')
      .select("*");

      const { data, error: challError } = await query;

      if (challError) {
      throw new Error(`Erreur lors du fetch des défis: ${challError.message}`);
    }

    // Stock data
    const challs: ChallDetail[] = (data || []).map((chall: any) => ({
      idChallenge: chall.idChallenge,
      name: chall.name,
      isGlobal: chall.isGlobal,
      description: chall.description,
      startDateTime: chall.startDateTime,
      endDateTime: chall.endDateTime,
      objective: chall.objective,
      isDraft: chall.isDraft,
      isActive: chall.isActive,
        goal: chall.goal
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
  body
): Promise<CompleteResponse> {
  try {
      // Insérer le nouveau challenge
      console.log(body)
      const { data, error: insertError } = await supabase
          .from("Challenge")
          .insert([
              //{idChallenge: body.idChallenge },
              {name: body.name,
              description: body.description,
              objective: body.objective,
              isActive: body.isActive ?? false,
              isDraft: body.isDraft ?? true,
              isGlobal: body.isGlobal ?? true,
              startDateTime: body.startDateTime ?? null,
              endDateTime: body.endDateTime ?? null,
              goal: body.goal}
                  ])
          .select()
          .single();

      if (insertError) {
          throw new Error(`Erreur lors de la création: ${insertError.message}`);
      }

      return {
          data: data,
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
      isGlobal?: boolean
      description?: string;
      startDateTime?: string;
      endDateTime?: string;
      objective?: number;
      isDraft?: boolean;
      isActive?: boolean;
      goal?: string;
  }
): Promise<CompleteResponse> {
  try {
      // Mettre à jour le challenge
      const query  = await supabase
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
              ...(updateData.goal !== undefined && { goal: updateData.goal }),
          })
          .eq("idChallenge", idChall)
          .select()
          .single();
      const { data: updatedChall, error: updateError } = await query;

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
       const query = await supabase
          .from("Challenge")
          .delete()
          .eq("idChallenge", idChall);

      const { data, error: deleteError } = await query;
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
