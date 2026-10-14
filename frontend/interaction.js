// A tap commits on release; scrolling/pinching must not type an accidental key.
// Holding starts the ROM's normal held-key behavior after a short gesture window.
export function createPointerController({ press,release,feedback=()=>{},schedule=setTimeout,cancel=clearTimeout,holdMs=180,slop=10 }) {
	let current=null;
	function clearTimer() {
		if(current?.timer!=null) { cancel(current.timer); current.timer=null; }
	}
	function abort() {
		if(!current) return;
		clearTimer();
		if(current.held) release(current.id);
		feedback(-1);
		current=null;
	}
	return {
		down(event,index) {
			if(event.pointerType==='touch' && event.isPrimary===false) { abort(); return false; }
			if(current || event.button!==0) return false;
			current={ id:event.pointerId,index,x:event.clientX,y:event.clientY,touch:event.pointerType==='touch',held:false,cancelled:false,timer:null };
			feedback(index);
			if(current.touch) {
				current.timer=schedule(()=>{
					if(!current || current.cancelled) return;
					current.timer=null; current.held=true; press(index,current.id);
				},holdMs);
			} else { current.held=true; press(index,current.id); }
			return true;
		},
		move(event) {
			if(!current || current.id!==event.pointerId || !current.touch || current.cancelled) return;
			if(Math.hypot(event.clientX-current.x,event.clientY-current.y)>slop) {
				clearTimer();
				if(current.held) release(current.id);
				current.held=false; current.cancelled=true; feedback(-1);
			}
		},
		up(event) {
			if(!current || current.id!==event.pointerId) return;
			clearTimer();
			if(!current.cancelled) {
				if(!current.held) press(current.index,current.id);
				release(current.id);
			}
			feedback(-1); current=null;
		},
		cancel(event) { if(current?.id===event.pointerId) abort(); },
		abort,
	};
}
