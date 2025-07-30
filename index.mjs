import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const provinces = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

// Normalize phone numbers
const normalizePhone = (phone) => phone?.replace(/\D/g, "").slice(-10);
const shapedDataPhone = normalizePhone(update.phone);

// Normalize postal codes
const normalizePostal = (postal) => postal?.replace(/\W/g, "").toUpperCase();
const shapedDataPostal = normalizePostal(update.postcode);

// Normalize names
const normalizeName = (name) => name?.toLowerCase().trim();

async function findProfile(supabaseClient, shapedData) {
  if (!supabaseClient || !shapedData) throw new Error("Invalid parameters");

  try {
    const shapedDataFirstName = normalizeName(shapedData.firstname);
    const shapedDataLastName = normalizeName(shapedData.surname);
    const shapedDataAddress = normalizeName(shapedData.address);
    const shapedDataEmail = normalizeName(shapedData.address).split("@")[0];
    const shapedDataRiding = normalizeName(
      shapedData.division_electoral_district
    );

    // Search conditions in order of reliability
    const searchConditions = [
      // Exact VAN ID match
      shapedData.van_id && {
        query: (q) => q.eq("van_id", shapedData.van_id),
      },

      // Same name + email
      shapedDataFirstName &&
        shapedDataLastName &&
        shapedData.email && {
          query: (q) =>
            q
              .ilike("firstname", `%${shapedDataFirstName}%`)
              .ilike("surname", `%${shapedDataLastName}%`)
              .ilike("email", `%${shapedDataEmail}%`),
        },
      // Same name + phone
      shapedDataFirstName &&
        shapedDataLastName &&
        shapedDataPhone && {
          query: (q) =>
            q
              .ilike("firstname", `%${shapedDataFirstName}%`)
              .ilike("surname", `%${shapedDataLastName}%`)
              .ilike("phone", `%${shapedDataPhone}%`),
        },
      // Same name + postal
      shapedDataFirstName &&
        shapedDataLastName &&
        shapedDataPostal && {
          query: (q) =>
            q
              .ilike("firstname", `%${shapedDataFirstName}%`)
              .ilike("surname", `%${shapedDataLastName}%`)
              .eq("postcode", shapedDataPostal),
        },
      // Same name + address
      shapedDataFirstName &&
        shapedDataLastName &&
        shapedDataAddress && {
          query: (q) =>
            q
              .ilike("firstname", `%${shapedDataFirstName}%`)
              .ilike("surname", `%${shapedDataLastName}%`)
              .ilike("street_address", `%${shapedDataLastName}%`),
        },
      // Same name + riding
      shapedDataFirstName &&
        shapedDataLastName &&
        shapedDataRiding && {
          query: (q) =>
            q
              .ilike("firstname", `%${shapedDataFirstName}%`)
              .ilike("surname", `%${shapedDataLastName}%`)
              .ilike("division_electoral_district", `%${shapedDataRidings}%`),
        },
      // Same name and nothing else
      shapedDataFirstName &&
        shapedDataLastName && {
          query: (q) =>
            q
              .ilike("firstname", `%${shapedDataFirstName}%`)
              .ilike("surname", `%${shapedDataLastName}%`)
              .eq("street_address", `%${shapedDataLastName}%`)
              .is("email", null)
              .is("phone", null)
              .is("postcode", null)
              .is("division_electoral_district", null),
        },
    ].filter(Boolean);

    // Try each condition in sequence
    for (const condition of searchConditions) {
      const query = supabaseClient.from("contact").select();
      condition.query(query);

      const { data, error } = await query;
      if (error) throw error;

      if (data?.length > 0) {
        // If multiple matches, use most recently updated record
        const sorted = data.sort((a, b) =>
          (b.updated_at || b.created_at || "").localeCompare(
            a.updated_at || a.created_at || ""
          )
        );
        return sorted[0];
      }
    }

    return null;
  } catch (error) {
    console.error("Profile lookup error:", error);
    throw error;
  }
}

const opennorth_postcode = async (postcode, sets) => {
  try {
    const response = await fetch(
      `https://represent.opennorth.ca/postcodes/${postcode.replace(
        " ",
        ""
      )}${sets}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
};
const get_fed = async (postcode) => {
  try {
    const data = opennorth_postcode(
      postcode,
      "/?sets=federal-electoral-districts-2023-representation-order"
    );
    return data?.boundaries_centroid?.[0]?.name || null;
  } catch (error) {
    throw error;
  }
};
const get_ded = async (postcode) => {
  try {
    const data = opennorth_postcode(
      postcode,
      "/?sets=ontario-electoral-districts-representation-act-2015"
    );
    return data?.boundaries_centroid?.[0]?.name || null;
  } catch (error) {
    throw error;
  }
};
const get_geo = async (postcode) => {
  try {
    const data = opennorth_postcode(postcode, "");
    const municipality = data?.city;
    const division = data?.province;
    return { municipality, division };
  } catch (error) {}
};
const getRidings = async (postcode) => {
  try {
    const fed = get_fed(postcode);
    const ded = get_ded(postcode);
    const geo = get_geo(postcode);
    return { fed, ded };
  } catch (error) {
    console.log("riding search error:", error);
    throw error;
  }
};
function commaSeperate(profileValue, shapedDataValue) {
  if (shapedDataValue && profileValue) {
    if (profileValue.split(",").includes(shapedDataValue)) {
      return profileValue;
    } else {
      return profileValue + "," + shapedDataValue;
    }
  }
  return shapedDataValue;
}
function commaSeperateUpdateLogic(updateData, profile, shapedData, key) {
  if (shapedData[key] && profile[key]) {
    if (profile[key].split(",").includes(shapedData[key])) {
      updateData[key] = profile[key];
    } else {
      updateData[key] = profile[key] + "," + shapedData[key];
    }
  } else if (shapedData[key]) {
    updateData[key] = shapedData[key];
  }
  return updateData;
}
function consolidateData(profile, shapedData) {
  const updateData = {};
  if (!profile) {
    return shapedData;
  }
  updateData.id = profile.id;

  for (const key in shapedData) {
    if (key.includes("olp23")) {
      commaSeperateUpdateLogic(updateData, profile, shapedData, key);
    } else if (profile[key]) {
      if (profile[key] === shapedData[key]) {
        updateData[key] = shapedData[key];
      } else if (
        typeof profile[key] === "string" &&
        profile[key].includes(shapedData[key])
      ) {
        updateData[key] = profile[key];
      } else if (
        typeof shapedData[key] === "string" &&
        shapedData[key].includes(profile[key])
      ) {
        updateData[key] = shapedData[key];
      } else {
        updateData[key] = shapedData[key];
      }
    } else {
      updateData[key] = shapedData[key];
    }

    if (updateData.postcode || shapedData.postcode) {
      const postcode = updateData.postcode
        ? updateData.postcode
        : shapedData.postcode;
      const ridings = getRidings(postcode);
      updateData.federal_electoral_district = ridings.fed;
      updateData.division_electoral_district = ridings.ded;
      const geo = get_geo(postcode);
      updateData.division = provinces[geo.division.toUpperCase()];
      updateData.municipality = geo.municipality;
    }

    if (shapedData.ballot1 && profile.ballot1) {
      if (
        //if ballot 1 is the candidate, accept the new data
        shapedData.ballot1 == process.env.CANDIDATE
      ) {
        updateData.ballot1 = shapedData.ballot1;
      } else if (shapedData.ballot1 == process.env.NOT_CANDIDATE) {
        //if ballot1 is Not Candidate, accept the new data
        updateData.ballot1 = process.env.NOT_CANDIDATE;
      } else if (
        process.env.CANDIDATES.split(",").includes(shapedData.ballot1) &&
        shapedData.ballot1 != process.env.CANDIDATE &&
        profile.ballot1 == process.env.CANDIDATE
      ) {
        //if ballot1 is another candidate but old data is our candidate, turn old data as possibly our canddate
        updateData.ballot1 = process.env.POSSIBLE_CANDIDATE;
      } else if (profile.ballot1 == process.env.CANDIDATE) {
        //if ballot1 is not another candiddate and not explicitly not our candidate, but we already have the profile stored as our candidate, don't accept new data
        updateData.ballot1 = profile.ballot1;
      } else {
        updateData.ballot1 = shapedData.ballot1;
      }
    }

    var updateDataValue = commaSeperate(
      profile.organizer,
      shapedData.organizer
    );
    if (updateDataValue) {
      updateData.organizer = updateDataValue;
    }

    updateDataValue = commaSeperate(profile.language, shapedData.language);
    if (updateDataValue) {
      updateData.language = updateDataValue;
    }
    /*
    if (shapedData.olp23_ballot1 && profile.olp23_ballot1) {
      if (
        //if ballot 1 is the candidate, accept the new data
        shapedData.olp23_ballot1 == process.env.CANDIDATE
      ) {
        updateData.olp23_ballot1 = shapedData.olp23_ballot1;
      } else if (shapedData.olp23_ballot1 == process.env.NOT_CANDIDATE) {
        //if olp23_ballot1 is Not Candidate, accept the new data
        updateData.olp23_ballot1 = process.env.NOT_CANDIDATE;
      } else if (
        process.env.OLD_CANDIDATES.split(",").includes(
          shapedData.olp23_ballot1
        ) &&
        shapedData.olp23_ballot1 != process.env.CANDIDATE &&
        profile.olp23_ballot1 == process.env.CANDIDATE
      ) {
        //if olp23_ballot1 is another candidate but old data is our candidate, turn old data as possibly our canddate
        updateData.olp23_ballot1 = process.env.POSSIBLE_CANDIDATE;
      } else if (profile.olp23_ballot1 == process.env.CANDIDATE) {
        //if olp23_ballot1 is not another candiddate and not explicitly not our candidate, but we already have the profile stored as our candidate, don't accept new data
        updateData.olp23_ballot1 = profile.olp23_ballot1;
      } else {
        updateData.olp23_ballot1 = shapedData.olp23_ballot1;
      }
    }*/
  }
}

export const handler = async (payload) => {
  const shapedData = payload.payload;
  const supabase = createClient(process.env.DATABASE_URL, process.env.KEY);
  const profile = findProfile(supabase, shapedData);
  const updateData = consolidateData(profile, shapedData);

  console.log("About to upsert:", JSON.stringify(updateData));

  let query = supabase.from("contact");
  const { data: person, error: personError } = await query
    .upsert(updateData, {
      onConflict: "id",
    })
    .select();

  if (personError) {
    console.error("Upsert error:", personError);
    throw personError;
  }

  console.log("Successfully upserted:", JSON.stringify(person[0]));

  return {
    response: 200,
    update: person[0],
  };
  //search for a matching row in supabase
  //go through every key and consolidate
  //upsert
  //return
};
