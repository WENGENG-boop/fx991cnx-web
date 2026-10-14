// Source: the FX-991CN X at the left of the research repository's cover.png.
// Coordinates describe that original asset, not a redrawn calculator.
export const skin = {
	width:344, height:720,
	crop:{ x:68, y:0, width:344, height:720 },
	lcd:{ x:36, y:107, width:272, height:104, sourceX:47, sourceY:102, sourceWidth:192, sourceHeight:73 },
	blank:{ x:34, y:103, width:277, height:112, radius:10 },
	backgroundTop:[218,232,225], backgroundBottom:[198,223,210], ink:[29,41,33],
};

const rect = (x,y,w,h) => ({ x,y,w,h });
const grid = (xs,ys,w,h) => ys.flatMap(y => xs.map(x => rect(x,y,w,h)));
// Same index order as the ROM model's button_map (20 + 18 + 4 + 4 + 4).
export const keyRects = [
	...grid([22,84,145,207,269],[498,549,600,650],53,36),
	...grid([23,74,126,177,228,279],[370,412,455],43,26),
	rect(23,330,43,26), rect(74,330,43,26), rect(228,330,43,26), rect(279,330,43,26),
	rect(27,269,30,30), rect(73,269,31,30), rect(239,269,31,30), rect(284,269,31,30),
	rect(117,291,30,27), rect(195,291,30,27), rect(149,269,42,25), rect(149,319,42,23),
];

// Fill the inter-key spacing with disjoint touch regions, without changing
// visible keys. Boundaries sit halfway between adjacent key centers.
const cells=(xs,ys)=>ys.slice(0,-1).flatMap((y,row)=>xs.slice(0,-1).map((x,col)=>rect(x,y,xs[col+1]-x,ys[row+1]-y)));
export const touchRects=[
	...cells([18,79.5,141,202.5,264.5,327],[492,541.5,592.5,643,695]),
	...cells([19,70,121.5,173,224,275,326],[363,404,446.5,492]),
	rect(19,323,51,40),rect(70,323,51.5,40),rect(224,323,51,40),rect(275,323,51,40),
	rect(21,263,42,42),rect(67,263,43,42),rect(233,263,43,42),rect(278,263,43,42),
	rect(113,294,36,25),rect(191,294,38,25),rect(143,263,54,31),rect(143,319,54,31),
];

export function touchKeyAt(x,y) {
	return touchRects.findIndex(box=>x>=box.x && x<box.x+box.w && y>=box.y && y<box.y+box.h);
}

export function photoKeyAt(x,y) {
	return keyRects.findIndex(box => x>=box.x && x<box.x+box.w && y>=box.y && y<box.y+box.h);
}
export function corePointForPhoto(buttons,x,y) {
	const index = photoKeyAt(x,y);
	if (index<0) return null;
	const box = buttons[index].rect;
	return { index, x:box.x+box.w/2, y:box.y+box.h/2 };
}

// Recover the live raster's ink opacity. Preserve the ROM's contrast and
// dim-screen mode while removing the old grey faceplate's background tint.
export function lcdRaster(frame,contrast,mode,memory=null) {
	let off = Math.max(0,(contrast-8)*7) & 255;
	if (mode===6) off=20;
	const offGreen = Math.floor((46*off + 227*(255-off))/255);
	const data = new Uint8ClampedArray(skin.lcd.sourceWidth*skin.lcd.sourceHeight*4);
	for(let y=0; y<skin.lcd.sourceHeight; ++y) for(let x=0; x<skin.lcd.sourceWidth; ++x) {
		const src=((skin.lcd.sourceY+y)*frame.width+skin.lcd.sourceX+x)*4;
		const dest=(y*skin.lcd.sourceWidth+x)*4;
		data[dest]=skin.ink[0]; data[dest+1]=skin.ink[1]; data[dest+2]=skin.ink[2];
		data[dest+3]=Math.max(0,Math.min(255,Math.round((offGreen-frame.data[src+1])*255/Math.max(1,offGreen-46))));
	}
	if(memory) {
		if(memory.length<64*32) throw new Error('Incomplete FX-991CN X LCD memory');
		// Status indicators occupy individual bytes in the first VRAM row.
		// Gate their original glyphs by those bytes, not by stains in the atlas.
		const status=[
			[0,8,0],[8,8,1],[16,10,2],[26,13,3],[39,17,5],[56,8,6],[64,7,7],[71,9,8],
			[80,14,9],[94,15,10],[109,9,11],[118,6,12],[124,7,13],[131,11,15],
			[142,7,16],[149,7,17],[156,6,18],[162,9,19],[171,12,21],[183,9,22],
		];
		const showStatus=mode===5 || mode===6;
		for(const [left,width,offset] of status) {
			if(showStatus && (memory[offset]&1)) continue;
			for(let y=0;y<8;y++)for(let x=left;x<left+width;x++)data[(y*192+x)*4+3]=0;
		}
		// Two blank rows separate status from the 192 x 63 character matrix.
		for(let y=8;y<10;y++)for(let x=0;x<192;x++)data[(y*192+x)*4+3]=0;
		const on=Math.min(255,20+contrast*16);
		const inactive=mode===6 ? 20 : mode===5 ? (Math.max(0,(contrast-8)*7)&255) : 0;
		// The inactive tint is already represented by the LCD background.
		// Normalize contrast relative to it rather than painting a dark rectangle.
		const normalizedOn=Math.round(Math.max(0,on-inactive)*255/Math.max(1,255-inactive));
		for(let y=0;y<63;y++)for(let x=0;x<192;x++) {
			const set=mode===5 && (memory[(y+1)*32+(x>>3)]&(0x80>>(x&7)));
			data[((y+10)*192+x)*4+3]=set ? normalizedOn : 0;
		}
	}
	return data;
}

export function drawSkin(context,cover,lcdCanvas=null,{smooth=true}={}) {
	const c=skin.crop, b=skin.blank;
	context.imageSmoothingEnabled=true;
	context.imageSmoothingQuality='high';
	context.drawImage(cover,c.x,c.y,c.width,c.height,0,0,skin.width,skin.height);
	context.save();
	context.beginPath();
	context.roundRect(b.x,b.y,b.width,b.height,b.radius);
	context.clip();
	const gradient=context.createLinearGradient(0,b.y,0,b.y+b.height);
	gradient.addColorStop(0,`rgb(${skin.backgroundTop.join(',')})`);
	gradient.addColorStop(1,`rgb(${skin.backgroundBottom.join(',')})`);
	context.fillStyle=gradient;
	context.fillRect(b.x,b.y,b.width,b.height);
	if(lcdCanvas) {
		// Antialias the existing ROM dot pattern; never replace its typeface.
		context.imageSmoothingEnabled=smooth;
		context.imageSmoothingQuality='high';
		context.drawImage(lcdCanvas,skin.lcd.x,skin.lcd.y,skin.lcd.width,skin.lcd.height);
	}
	context.restore();
}

// Deterministic composition for Node checks; not browser acceptance evidence.
export function composeSkin(cover,width,frame,contrast,mode,memory=null) {
	const out=new Uint8ClampedArray(skin.width*skin.height*4);
	for(let y=0; y<skin.height; ++y) for(let x=0; x<skin.width; ++x) {
		const src=((y+skin.crop.y)*width+x+skin.crop.x)*4;
		out.set(cover.subarray(src,src+4),(y*skin.width+x)*4);
	}
	const b=skin.blank;
	const inside=(x,y)=>{
		const cx=Math.max(b.x+b.radius,Math.min(x,b.x+b.width-b.radius));
		const cy=Math.max(b.y+b.radius,Math.min(y,b.y+b.height-b.radius));
		return (x-cx)**2+(y-cy)**2<=b.radius**2;
	};
	for(let y=b.y; y<b.y+b.height; ++y) for(let x=b.x; x<b.x+b.width; ++x) {
		if(!inside(x+.5,y+.5)) continue;
		const t=(y-b.y+.5)/b.height, dst=(y*skin.width+x)*4;
		for(let channel=0; channel<3; ++channel) out[dst+channel]=Math.round(skin.backgroundTop[channel]*(1-t)+skin.backgroundBottom[channel]*t);
		out[dst+3]=255;
	}
	const lcd=lcdRaster(frame,contrast,mode,memory), box=skin.lcd;
	for(let y=0; y<box.height; ++y) for(let x=0; x<box.width; ++x) {
		if(!inside(box.x+x+.5,box.y+y+.5)) continue;
		const src=(Math.floor(y*box.sourceHeight/box.height)*box.sourceWidth+Math.floor(x*box.sourceWidth/box.width))*4;
		const dst=((box.y+y)*skin.width+box.x+x)*4, alpha=lcd[src+3]/255;
		for(let channel=0; channel<3; ++channel) out[dst+channel]=Math.round(lcd[src+channel]*alpha+out[dst+channel]*(1-alpha));
	}
	return out;
}
