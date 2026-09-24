export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = new Set([
      "https://michelrizk334-creator.github.io",
      "http://localhost:8000",
      "http://localhost:8080"
    ]);
    const cors = {
      "Access-Control-Allow-Origin": allowed.has(origin) ? origin : "https://michelrizk334-creator.github.io",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
    if (!allowed.has(origin)) return Response.json({error:"Origin not allowed"},{status:403,headers:cors});

    const url = new URL(request.url);

    // Existing barcode workflow — preserved.
    if (request.method === "GET" && url.pathname.startsWith("/barcode/")) {
      try {
        const barcode = url.pathname.split("/").pop().replace(/\D/g,"");
        if (!barcode) return Response.json({error:"A barcode is required."},{status:400,headers:cors});
        const fields = "product_name,nutriments,serving_size";
        const off = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${fields}`,{
          headers:{"User-Agent":"Calorie-Count/1.0 (nutrition lookup)"}
        });
        const data = await off.json();
        if (!off.ok || data.status !== 1 || !data.product) return Response.json({error:"Product not found in Open Food Facts."},{status:404,headers:{...cors,"Cache-Control":"no-store"}});
        const p=data.product, n=p.nutriments||{};
        const kcal=Number(n["energy-kcal_100g"] ?? n["energy-kcal"] ?? 0);
        const carbs=Number(n.carbohydrates_100g ?? n.carbohydrates ?? 0);
        const protein=Number(n.proteins_100g ?? n.proteins ?? 0);
        const fat=Number(n.fat_100g ?? n.fat ?? 0);
        return Response.json({nutrition:{
          product_name:p.product_name||"",
          reference_amount:100,
          unit:"grams",
          calories_kcal:Number.isFinite(kcal)?kcal:0,
          carbs_g:Number.isFinite(carbs)?carbs:0,
          protein_g:Number.isFinite(protein)?protein:0,
          fat_g:Number.isFinite(fat)?fat:0,
          basis_label:"per 100 g",
          warning:"Review the package label before saving; Open Food Facts is community-maintained."
        }},{headers:{...cors,"Cache-Control":"no-store"}});
      } catch (e) {
        return Response.json({error:e.message||"Barcode lookup failed."},{status:500,headers:{...cors,"Cache-Control":"no-store"}});
      }
    }

    // v27: ChatGPT food + ready-meal lookup.
    if (url.pathname === "/food-search" && request.method === "POST") {
      if (!env.OPENAI_API_KEY) return Response.json({error:"ChatGPT food lookup is not configured yet. Add OPENAI_API_KEY to the Worker secrets."},{status:500,headers:cors});
      try {
        const body=await request.json();
        const query=String(body?.query||"").trim();
        if (!query) return Response.json({error:"A food or meal description is required."},{status:400,headers:cors});
        if (query.length>1200) return Response.json({error:"Description is too long."},{status:400,headers:cors});

        const schema={
          type:"object",
          properties:{
            results:{type:"array",minItems:1,maxItems:5,items:{
              type:"object",
              properties:{
                name:{type:"string"},
                description:{type:"string"},
                reference_amount:{type:"number"},
                unit:{type:"string",enum:["grams","milliliters","units"]},
                calories_kcal:{type:"number"},
                carbs_g:{type:"number"},
                protein_g:{type:"number"},
                fat_g:{type:"number"},
                basis_label:{type:"string"},
                assumptions:{type:"string"}
              },
              required:["name","description","reference_amount","unit","calories_kcal","carbs_g","protein_g","fat_g","basis_label","assumptions"],
              additionalProperties:false
            }}
          },
          required:["results"],additionalProperties:false
        };

        const api=await fetch("https://api.openai.com/v1/responses",{
          method:"POST",
          headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},
          body:JSON.stringify({
            model:env.OPENAI_MODEL||"gpt-5.6-luna",
            store:false,
            instructions:"You are the nutrition lookup inside Calorie Count. Estimate practical calories and macros for foods and meal descriptions. If the user describes one complete portion or meal, return ONE result for the whole described portion, preserve their description closely, set reference_amount=1 and unit=units, and make calories/macros totals for that whole portion. State important quantity assumptions such as estimated grams for 'big', tablespoon size, cup size, cooking method, sauces or oils. If the user searches a generic single food without a quantity, return up to 3 useful common interpretations and normally use a 100 g or 100 ml reference. If a branded product is requested and exact data is uncertain, say so in assumptions rather than inventing label precision. Nutrition values are estimates and must be non-negative.",
            input:`Food or meal description: ${query}`,
            text:{format:{type:"json_schema",name:"food_search",strict:true,schema}}
          })
        });
        const data=await api.json();
        if(!api.ok) throw new Error(data?.error?.message||"ChatGPT request failed.");
        const outputText=data.output_text||(data.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==="output_text")?.text;
        if(!outputText) throw new Error("ChatGPT returned no nutrition data.");
        const parsed=JSON.parse(outputText);
        return Response.json(parsed,{headers:{...cors,"Cache-Control":"no-store"}});
      } catch(e) {
        return Response.json({error:e.message||"Could not look up this food."},{status:500,headers:{...cors,"Cache-Control":"no-store"}});
      }
    }

    return Response.json({error:"Not found"},{status:404,headers:cors});
  }
};
