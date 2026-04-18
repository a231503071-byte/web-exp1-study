const express=require('express');const cors=require('cors');const fs=require('fs');const path=require('path');
const app=express();const PORT=process.env.PORT||3000;const SAVE_DIR=path.join(__dirname,'data');
if(!fs.existsSync(SAVE_DIR))fs.mkdirSync(SAVE_DIR,{recursive:true});
app.use(cors());app.use(express.json({limit:'10mb'}));
app.get('/health',(req,res)=>res.json({ok:true}));
app.post('/submit',(req,res)=>{try{const data=req.body||{};const subjectID=(data.participant&&data.participant.subjectID)||'unknown';const group=data.groupLabel||'NA';const ts=new Date().toISOString().replace(/[:.]/g,'-');const fn=`${subjectID}_${group}_${ts}.json`;fs.writeFileSync(path.join(SAVE_DIR,fn),JSON.stringify(data,null,2),'utf8');res.json({ok:true,saved:fn});}catch(err){res.status(500).json({ok:false,error:'save_failed'});}});
app.listen(PORT,()=>console.log(`collector on http://localhost:${PORT}`));