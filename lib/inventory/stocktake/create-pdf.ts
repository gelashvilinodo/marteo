import type { PDFFont, PDFPage } from 'pdf-lib';
import type { StocktakeDocument } from './types';
export async function createStocktakePdf(data:StocktakeDocument, suppliedFonts?:{regular:Uint8Array;bold:Uint8Array}):Promise<Blob> {
    const [{PDFDocument,rgb},fontkit]=await Promise.all([import('pdf-lib'),import('@pdf-lib/fontkit')]);
    async function font(url:string){const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('ქართული შრიფტი ვერ ჩაიტვირთა.');return new Uint8Array(await response.arrayBuffer());}
    const bytes=suppliedFonts??{regular:await font('/fonts/FiraGO-Regular.otf'),bold:await font('/fonts/FiraGO-Bold.otf')};
    const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit.default??fontkit);const regular=await pdf.embedFont(bytes.regular,{subset:false}),bold=await pdf.embedFont(bytes.bold,{subset:false});
    pdf.setTitle('მარაგის საინვენტარიზაციო უწყისი');pdf.setAuthor(data.businessName);pdf.setSubject('A4 inventory count');
    const W=595.2756,H=841.8898,M=32,usable=W-2*M;
    const weights=[22,155,38,48,67,54,52,95],sum=weights.reduce((a,b)=>a+b,0),widths=weights.map(w=>w/sum*usable);
    const labels=['№','დასახელება / მახასიათებლები','ერთ.','ნაშთი','წუნდებული','ფაქტობრივი','სხვაობა','შენიშვნა'];
    let page:PDFPage,top=0;
    function text(value:string,x:number,y:number,size=8,f=regular){page.drawText(value,{x,y:H-y-size,font:f,size,color:rgb(0.08,0.1,0.13)});}
    function wrap(value:string,f:PDFFont,size:number,width:number){const result:string[]=[];for(const paragraph of value.replace(/[\u0000-\u0008\u000b-\u001f]/g,'').split(/\r?\n/)){let line='';for(const word of paragraph.split(/\s+/).filter(Boolean)){if(f.widthOfTextAtSize(line?line+' '+word:word,size)<=width){line=line?line+' '+word:word;continue;}if(line){result.push(line);line='';}for(const char of word){if(line&&f.widthOfTextAtSize(line+char,size)>width){result.push(line);line='';}line+=char;}}result.push(line);}return result.length?result:[''];}
    function lines(value:string,x:number,y:number,width:number,size=8,f=regular){const rows=wrap(value,f,size,width);rows.forEach((line,i)=>text(line,x,y+i*(size+3),size,f));return rows.length*(size+3);}
    function tableHeader(){const height=48;let x=M;labels.forEach((label,i)=>{page.drawRectangle({x,y:H-top-height,width:widths[i],height,borderWidth:0.5,borderColor:rgb(0.7,0.73,0.77),color:rgb(0.94,0.95,0.96)});lines(label,x+4,top+6,widths[i]-8,7,bold);x+=widths[i];});top+=height;}
    function newPage(){page=pdf.addPage([W,H]);top=30;top+=lines(data.businessName,M,top,usable,12,bold)+5;top+=lines('მარაგის საინვენტარიზაციო უწყისი — '+(data.kind==='materials'?'მასალები':'პროდუქტები'),M,top,usable,11,bold)+5;const date=new Intl.DateTimeFormat('ka-GE',{timeZone:'Asia/Tbilisi',dateStyle:'short',timeStyle:'short'}).format(new Date(data.createdAt));top+=lines('ნაშთის მდგომარეობა: '+date+' · '+data.filterDescription,M,top,usable,8)+8;top+=lines('ნაშთი მოიცავს წუნდებულსაც. გზაში მყოფი რაოდენობა ფიზიკურ ნაშთში არ შედის.',M,top,usable,7)+10;tableHeader();}
    const form=pdf.getForm();newPage();
    data.rows.forEach((row,index)=>{
        const description=wrap(row.name+'\n'+row.details,regular,8,widths[1]-8);const remaining=[...description];let part=0;
        while(remaining.length){if(top>H-90)newPage();const maxLines=Math.max(1,Math.floor((H-52-top-12)/11)),chunk=remaining.splice(0,maxLines),height=Math.max(44,chunk.length*11+12);let x=M;
            widths.forEach(width=>{page.drawRectangle({x,y:H-top-height,width,height,borderWidth:0.4,borderColor:rgb(0.75,0.77,0.8)});x+=width;});
            x=M;const values=[String(index+1)+(part?'*':''),'',row.unit,part?'':row.quantity,part?'':row.defective];values.forEach((value,i)=>{if(i===1)chunk.forEach((line,j)=>text(line,x+4,top+6+j*11));else lines(value,x+4,top+6,widths[i]-8,8);x+=widths[i];});
            if(!part){for(const [column,key]of [[5,'actual'],[6,'difference'],[7,'note']] as const){const left=M+widths.slice(0,column).reduce((a,b)=>a+b,0);const field=form.createTextField(key+'_'+index);if(key==='note')field.enableMultiline();field.addToPage(page,{x:left+3,y:H-top-height+3,width:widths[column]-6,height:height-6,borderWidth:0,font:regular,textColor:rgb(0.08,0.1,0.13)});field.setFontSize(8);}}
            top+=height;part++;
        }
    });
    if(!data.rows.length){text('ამ არჩევანით მარაგი არ მოიძებნა.',M+8,top+15);top+=48;}
    if(top>H-145)newPage();top+=18;text('ჩანაწერები: '+data.rows.length,M,top,8,bold);top+=25;text('ინვენტარიზაციის თარიღი: ___________________',M,top);top+=28;text('პასუხისმგებელი პირი: _______________________',M,top);top+=28;text('ხელმოწერა: ______________________________',M,top);
    form.updateFieldAppearances(regular);
    const pages=pdf.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:W-M-35,y:18,size:8,font:regular,color:rgb(0.35,0.38,0.4)}));
    return new Blob([new Uint8Array(await pdf.save())],{type:'application/pdf'});
}
