import { skin } from './skin.js';

// Fit a full calculator when possible; never make a landscape phone's keys tiny.
export function deviceLayout({ width,height,reserved=104,coarse=false,zoomed=false,fitScreen=false }) {
	const available=Math.max(1,width);
	const tablet=Math.min(available,height)>=600;
	const minimum=Math.min(available,coarse ? (tablet ? 330 : 286) : 286);
	const maximum=coarse ? (tablet ? 480 : 400) : 400;
	const room=Math.max(1,height-reserved);
	const fit=Math.min(available,maximum,room*skin.width/skin.height);
	const panelWidth=fitScreen ? fit : zoomed ? Math.min(available,tablet ? 540 : 420) : Math.max(minimum,fit);
	return { width:panelWidth,height:panelWidth*skin.height/skin.width,scrolls:panelWidth*skin.height/skin.width>room };
}

export function canvasResolution(width,height,density) {
	// Supersample on ordinary displays too, so fractional LCD scaling is smooth.
	const ratio=Math.max(2,Math.min(3,density || 1));
	return { width:Math.round(width*ratio),height:Math.round(height*ratio) };
}
