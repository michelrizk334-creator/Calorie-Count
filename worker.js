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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Vary": "Origin"
    };
    if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
    const url = new URL(request.url);
    if (url.pathname !== "/scan-label" || request.method !== "POST")
      return Response.json({error:"Not found"},{status:404,headers:cors});
    if (!allowed.has(origin))
      return Response.json({error:"Origin not allowed"},{status:403,headers:cors});
    if (!env.OPENAI_API_KEY)
      return Response.json({error:"Server is missing OPENAI_API_KEY"},{status:500,headers:cors});

    try {
      const {image} = await request.json();
      if (!image || typeof image !== "string" || !image.startsWith("data:image/"))
        return Response.json({error:"A nutrition-label image is required."},{status:400,headers:cors});
      if (image.length > 17_000_000)
        return Response.json({error:"Image is too large."},{status:413,headers:cors});

      const schema = {
        type:"object",
        properties:{
          product_name:{type:["string","null"]},
          reference_amount:{type:"number"},
          unit:{type:"string",enum:["grams","milliliters","units"]},
          calories_kcal:{type:"number"},
          carbs_g:{type:"number"},
          protein_g:{type:"number"},
          fat_g:{type:"number"},
          basis_label:{type:"string"},
          warning:{type:"string"}
        },
        required:["product_name","reference_amount","unit","calories_kcal","carbs_g","protein_g","fat_g","basis_label","warning"],
        additionalProperties:false
      };

      const api = await fetch("https://api.openai.com/v1/responses",{
        method:"POST",
        headers:{"Authorization":"Bearer "+env.OPENAI_API_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({
          model: env.OPENAI_MODEL || "gpt-4.1-mini",
          store:false,
          instructions:"Read the nutrition facts label precisely. Extract ONE internally consistent column/basis. Prefer per 100 g or per 100 ml when clearly printed; otherwise use the main serving/unit column. Never mix macros from one column with calories from another. Convert kJ to kcal only if kcal is absent, using kcal=kJ/4.184, and mention the conversion in warning. If the product name is not visible, return null. reference_amount is the numeric amount for the selected basis. For 'per 1 item' use reference_amount 1 and unit units. warning should be empty when confident, otherwise briefly explain what the user must verify.",
          input:[{role:"user",content:[
            {type:"input_text",text:"Extract calories, carbohydrates, protein and fat from this nutrition label. Return the selected reference basis exactly and do not infer missing nutrition values."},
            {type:"input_image",image_url:image,detail:"high"}
          ]}],
          text:{format:{type:"json_schema",name:"nutrition_label",strict:true,schema}}
        })
      });
      const data=await api.json();
      if(!api.ok) throw new Error(data?.error?.message || "AI request failed");
      const outputText = data.output_text || (data.output||[]).flatMap(x=>x.content||[]).find(x=>x.type==="output_text")?.text;
      if(!outputText) throw new Error("AI returned no nutrition data");
      const nutrition=JSON.parse(outputText);
      return Response.json({nutrition},{headers:{...cors,"Cache-Control":"no-store"}});
    } catch (e) {
      return Response.json({error:e.message || "Could not scan label"},{status:500,headers:{...cors,"Cache-Control":"no-store"}});
    }
  }
};