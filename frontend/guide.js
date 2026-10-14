// Original instructions, checked against Casio manual RJA530830-001V02.
// Page numbers refer to printed pages, not the viewer's 1-based page count.
export const manual = {
	url:'https://www.casio.com/content/dam/casio/global/support/manuals/calculators/pdf/004-zh-cn/f/fx-991CN_X_B_CN.pdf',
	revision:'RJA530830-001V02',
};
export const topics = [
	{ id:'start',category:'入门',title:'接通电源、选择模式与清除输入',tags:'菜单 AC ON DEL 开机 关机',page:4,manualSection:'入门；指定计算模式（第 7–8 页）',precondition:'先开机，再选所需模式。关机和清除输入是不同操作。',steps:[['开机：点 ON。进入普通计算：点「菜单」，再点 1（计算）。',[45,44,10]],['清除当前输入用 AC。编辑表达式时先移动光标，再用 DEL 删除；两者不是全部初始化。',[4,3]],['关机：先按 SHIFT，再按 AC。再次按 ON 可开机。',[42,4]]],note:'AC 或关机不会清除已存变量。全部初始化会删除记忆，不作为普通清除操作。' },
	{ id:'shift',category:'入门',title:'按键颜色与 SHIFT / ALPHA',tags:'SHIFT ALPHA 黄色 红色 蓝色 紫色',page:5,manualSection:'键标记',precondition:'按键上面的印字是备用功能；先按修饰键并松开，再按目标键。',steps:[['黄色功能使用 SHIFT。例如输入 5 的阶乘：5 → SHIFT → x⁻¹ → =。',[6,42,28,19]],['红色变量使用 ALPHA。例如输入 A：ALPHA → (−)。',[43,26]],['紫色功能在复数模式中使用；蓝色功能在基数模式中使用，不是一律按 SHIFT 调用。',[]]],note:'通常下一次按键后 SHIFT / ALPHA 状态解除；先看屏幕上的 S / A 指示符。' },
	{ id:'fraction',category:'常用计算',title:'分数输入：2/3 + 1/2',tags:'分子 分母 分数 数学输入 数学输出',page:18,manualSection:'基本计算／分数计算；输入/输出（第 8 页）',precondition:'计算模式；数学输入/数学输出。下面的方向键操作用于书面分数模板。',formula:'2/3 + 1/2 = 7/6',steps:[['进入计算，设置数学输入/数学输出：菜单 → 1；SHIFT → 菜单 → 1 → 1；AC 清除旧输入。',[44,10,42,44,10,10,4]],['点分数键，输入分子 2；点「下」输入分母 3，再点「右」退出分数。',[20,11,49,12,47]],['按 +，再点分数键，输入 1 → 下 → 2，最后按 =。',[13,20,10,49,11,19]]],note:'手册同时介绍线性分数输入，不要把两种格式的步骤混用。分数结果会约分；分数与小数混合时的结果取决于输入/输出设置。' },
	{ id:'decimal',category:'常用计算',title:'切换计算结果：精确值与小数',tags:'S⇔D 分数 小数 根式 π 近似',page:17,manualSection:'切换计算结果',precondition:'计算模式；数学输入/数学输出。先得到结果，再使用 S⇔D。',formula:'π ÷ 6 = π/6 ≈ 0.5235987756',steps:[['按 AC，然后 SHIFT → ×10ˣ 输入 π，再输入 ÷ → 6 → =。',[4,42,17,9,7,19]],['点 S⇔D，在支持的精确形式与小数形式之间切换。',[36]],['想直接求近似小数，重新输入算式后以 SHIFT → = 结束，而不是普通 =。',[4,42,17,9,7,42,19]]],note:'转换不是重新计算表达式。有些结果不能转换；构成带分数表达式的总位数超过限制时，也不能转换成带分数。' },
	{ id:'power',category:'常用计算',title:'乘方、乘方根与倒数',tags:'根号 幂 平方根 x² xʸ x³',page:27,manualSection:'函数计算／乘方、乘方根和倒数（第 27–28 页）',precondition:'计算模式；数学输入/数学输出。离开指数或根号模板后才能输入模板外的运算。',formula:'(5²)³ = 15625；√2 × 3 = 3√2',steps:[['按 AC，输入 ( → 5 → x² → ) → SHIFT → x² → =。SHIFT 加 x² 调用黄色 x³。',[4,34,6,22,35,42,22,19]],['平方根示例：AC → √ → 2 → 右 → × → 3 → =。',[4,21,11,47,8,12,19]],['任意次方使用 xʸ；指数填完后用「右」离开指数区域。它与专用 x²、x³ 键不同。',[23,47]]],note:'手册第 28 页的开方示例另指定 Fix 3 并使用 SHIFT → =，因此显示 4.243；未做这些设置时，不应期待相同的小数显示。' },
	{ id:'negative',category:'常用计算',title:'数值输入：负号与十的指数',tags:'负号 减号 指数 ×10 科学计数法',page:13,manualSection:'输入表达式和数值；计算优先顺序（第 14 页）',precondition:'计算模式。以下是分别输入的数值示例，每次先 AC 清除，不能直接串成同一个算式。',formula:'−3；6.02 × 10²³；1 × 10⁻³',steps:[['负数 −3：AC → (−) → 3 → =。使用专门的负号键。',[4,26,12,19]],['科学计数法：AC → 6 → . → 0 → 2 → ×10ˣ → 2 → 3 → =。',[4,7,16,15,11,17,11,12,19]],['负指数：AC → 1 → ×10ˣ → (−) → 3 → =，表示 0.001。',[4,10,17,26,12,19]]],note:'负号与减法不是同一个键。乘方比负号优先；需要对整个负数乘方时，先用括号把负数括起来。' },
	{ id:'factorial',category:'常用计算',title:'阶乘与百分比',tags:'x! n! % 百分数',page:31,manualSection:'函数计算／x!；百分比计算（第 19 页）',precondition:'计算模式。以下两个算例互相独立。',formula:'(5 + 3)! = 40320；150 × 20% = 30',steps:[['阶乘：AC → ( → 5 → + → 3 → ) → SHIFT → x⁻¹ → =。',[4,34,6,13,12,35,42,28,19]],['百分比：AC → 1 → 5 → 0 → × → 2 → 0 → SHIFT → Ans → =。SHIFT 加 Ans 调用黄色 %。',[4,10,6,15,8,11,15,42,18,19]]],note:'阶乘作用于括号内的整个表达式。百分比键将前面的数值按百分数处理，不是显示格式开关。' },
	{ id:'angle',category:'函数与设置',title:'三角函数与反三角函数',tags:'sin cos tan 三角函数 弧度 度 DEG RAD 反三角',page:10,manualSection:'配置计算器设定／角度单位；函数计算（第 26 页）',precondition:'计算模式；本例角度单位为度 D，不是弧度 R。',formula:'sin(30°) = 1/2；sin⁻¹(0.5) = 30°',steps:[['进入计算，再设为度：菜单 → 1；SHIFT → 菜单 → 2（角度单位）→ 1（度）。',[44,10,42,44,11,10]],['正弦：AC → sin → 3 → 0 → ) → =。',[4,29,12,15,35,19]],['反正弦：AC → SHIFT → sin → 0 → . → 5 → ) → =。',[4,42,29,15,16,6,35,19]]],note:'弧度在角度单位子菜单选 2，百分度选 3。相同输入在不同角度单位下的结果不同；D/R/G 设置不是小数位设置。' },
	{ id:'log',category:'函数与设置',title:'对数：模板必须指定底数',tags:'log ln 对数 自然对数 底数',page:27,manualSection:'函数计算／log、ln',precondition:'计算模式；数学输入/数学输出。面板 log 模板和 SHIFT 调用的 log 函数是两种输入方式。',formula:'log₂(16) = 4；log(1000) = 3',steps:[['任意底数模板：AC → log → 2 → 右 → 1 → 6 → =。先填底数，再填真数。',[4,24,11,47,10,7,19]],['十进制 log 函数：AC → SHIFT → (−) → 1 → 0 → 0 → 0 → ) → =。不指定底数时默认为 10。',[4,42,26,10,15,15,15,35,19]],['自然对数 ln 的底数固定为 e；例如 AC → ln → 9 → 0 → ) → =。',[4,25,2,15,35,19]]],note:'SHIFT 加 (−) 调用其上方的黄色 log；任意底数模板不可省略底数。ln(90) 的显示位数依赖当前 Fix/Sci/Norm 设置。' },
	{ id:'history',category:'入门',title:'计算历史记录与重放编辑',tags:'历史 方向 重放 Ans 上 下 DEL',page:23,manualSection:'计算历史记录与重放',precondition:'计算、复数或基数模式中可查看历史；本例在计算模式操作。',formula:'4 × 3 + 2 = 14 → 4 × 3 − 7 = 5',steps:[['输入原算式：AC → 4 → × → 3 → + → 2 → =。',[4,5,8,12,13,11,19]],['按「左」回到表达式，连按 DEL 两次删去末尾的 2 和 +，再输入 − → 7 → =。',[46,3,3,14,0,19]],['「上」查看更早的历史，「下」向较新的记录移动；不要把两颗方向键视为需要连续按的算式输入。',[48,49]]],note:'ON、切换模式、改输入/输出或重置设置会清除历史。Ans 存储的是上次结果，与计算历史列表不同。' },
	{ id:'memory',category:'函数与设置',title:'变量的指定、使用与调用',tags:'STO ALPHA 变量 记忆 存储 A 调用',page:24,manualSection:'使用存储器功能／变量（第 24–25 页）',precondition:'计算模式。A 印在 (−) 键上方；STO 后是选择变量，不需要再次 ALPHA。',formula:'A ← 3 + 5；A × 10 = 80',steps:[['将 3 + 5 存入 A：AC → 3 → + → 5 → STO → (−)。',[4,12,13,6,32,26]],['在表达式中使用 A：AC → ALPHA → (−) → × → 1 → 0 → =。',[4,43,26,8,10,15,19]],['调用 A：SHIFT → STO 打开变量列表，再按 (−) → =。',[42,32,26,19]]],note:'若要清除 A，用 0 → STO → (−)。该操作确实改写变量；网页记忆导出是额外工具，不是手册里的 STO 功能。' },
	{ id:'calc',category:'方程与数据',title:'CALC：给含变量的表达式代值',tags:'CALC 代入 变量 A B x 函数 求值',page:34,manualSection:'使用 CALC（第 34–35 页）',precondition:'计算模式或复数模式可用；本例进入计算模式，按手册示例依次输入 A、B 的值。',formula:'3A + B，A = 5、B = 10 → 25',steps:[['菜单 → 1 → AC，然后输入 3 → ALPHA → (−) → + → ALPHA → °′″，得到 3A + B。',[44,10,4,12,43,26,13,43,27]],['按 CALC。在 A 的提示中输入 5 → =，在 B 的提示中输入 1 → 0 → =。',[39,6,19,10,15,19]],['再按 = 执行代值计算，得到 25；AC 退出 CALC。',[19]]],note:'从进入 CALC 到退出期间，按线性输入步骤处理提示中的数值。CALC 不求未知数；多变量要逐个确认，不应跳过最后的执行确认。' },
	{ id:'solve',category:'方程与数据',title:'SOLVE：指定变量与初值求近似解',tags:'SOLVE 解方程 牛顿法 未知数 B x',page:35,manualSection:'使用 SOLVE（第 35–36 页）',precondition:'只在计算模式可用。按手册示例输入 x² + B = 0，给 x 初值 1、B 赋值 −2。',formula:'x² + B = 0，B = −2，初值 x = 1',steps:[['菜单 → 1 → AC。输入 x → x² → + → ALPHA → °′″ → ALPHA → CALC → 0。ALPHA 加 CALC 是等式中的 =，不是执行计算的右下角 =。',[44,10,4,41,22,13,43,27,43,39,15]],['按 SHIFT → CALC 进入 SOLVE。输入 x 初值 1 → =，再为 B 输入 (−) → 2 → =。',[42,39,10,19,26,11,19]],['按「上」把要求解的变量选回 x，再按 =。查看 x 的近似解与左侧−右侧的残差。',[48,19]]],note:'不要省略 sin、log 等函数的右括号。SOLVE 使用牛顿法，初值影响结果，不保证找到所有根；残差越接近 0 越好。' },
	{ id:'quadratic',category:'方程与数据',title:'方程/函数：输入多项式系数',tags:'方程 多项式 二次 根 解 系数',page:45,manualSection:'方程式计算／多项式方程（第 45–46 页）',precondition:'方程/函数模式；多项式方程；二次。先把方程写成 ax² + bx + c = 0。',formula:'2x² + x − 3 = 0 → x = 1 或 −1.5',steps:[['菜单 → 8（方程/函数）→ 2（多项式方程）→ 2（二次）。',[44,1,11,11]],['依次输入 a = 2、b = 1、c = −3：2 → = → 1 → = → (−) → 3 → =。',[11,19,10,19,26,12,19]],['填完后再按 = 显示解；每次继续按 = 显示其他解。显示最终解后再次 = 返回系数编辑器。',[19]]],note:'缺项填 0。系数表中的 AC 会把所有系数清为 0，不是只删一个数字；切换方程类型也会清空系数。' },
	{ id:'statistics',category:'方程与数据',title:'统计编辑器：录入并查看统计值',tags:'统计 平均数 标准差 单变量 数据 OPTN',page:36,manualSection:'统计计算／输入数据、显示统计值（第 36–38 页）',precondition:'统计模式；单变量统计。下面使用 1、2、3 作为录入示例，按手册规定的编辑器操作。',formula:'数据 1、2、3 → 平均数 2',steps:[['菜单 → 6（统计）→ 1（单变量统计）。',[44,7,10]],['在 x 列输入 1 → = → 2 → = → 3 → =；每个 = 确认一格并移到下一格。',[10,19,11,19,12,19]],['仍在数据编辑器时，OPTN → 3（单变量计算）查看统计值列表。',[38,12]],['从统计值列表按 AC 返回数据编辑器，再按 AC 进入统计计算屏幕；此时用 OPTN → 2 查看列表，不再是 OPTN → 3。',[4,4,38,11]]],note:'编辑器与计算屏幕的 OPTN 菜单不同。退出统计模式、切换单/双变量或改频率列设置会删除数据；列表同时列出总体与样本标准差。' },
	{ id:'table',category:'方程与数据',title:'创建数表：函数、范围与步长',tags:'表格 函数表 TABLE f(x) g(x) 步长',page:50,manualSection:'创建数表（第 50–51 页）',precondition:'表格模式；数学输入/数学输出；本条采用手册的双函数示例 f(x) = x² + 1/2、g(x) = x² − 1/2。',formula:'x 从 −1 到 1，步长 0.5',steps:[['菜单 → 7；SHIFT → 菜单 → 1 → 1，设为数学输入/数学输出。再 SHIFT → 菜单 → 下 → 下 → 1（表格）→ 2（f(x),g(x)），设置双函数表。',[44,0,42,44,10,10,42,44,49,49,10,11]],['输入 f(x)：x → x² → + → 分数 → 1 → 下 → 2 → =。',[41,22,13,20,10,49,11,19]],['输入 g(x)：x → x² → − → 分数 → 1 → 下 → 2 → =。',[41,22,14,20,10,49,11,19]],['范围中依次填开始 −1、终止 1、步长 0.5，每项用 = 确认；最后还要再按 = 生成数表。',[26,10,19,10,19,15,16,6,19,19]]],note:'若 g(x) 留空并确认，只生成 f(x)。仅 f(x) 最多 45 行，双函数最多 30 行；生成数表会改变变量 x。' },
	{ id:'modes',category:'更多模式',title:'不同模式的专用按键',tags:'复数 基数 进制 矩阵 向量 i HEX BIN DEC',page:7,manualSection:'指定计算模式；复数、基数、矩阵、向量章节',precondition:'先选模式，再使用对应功能；以下入口是分别选择，不要把几个模式的步骤连成一次输入。',steps:[['复数：菜单 → 2，然后 ENG 输入 i；极坐标符号 ∠ 用 SHIFT → ENG。',[44,11,33]],['基数：菜单 → 3。蓝色 DEC 在 x²、HEX 在 xʸ、BIN 在 log、OCT 在 ln 上，分别选择所需进制。',[44,12]],['矩阵：菜单 → 4，先定义 MatA 等变量的行数和列数，再逐格输入。',[44,5]],['向量：菜单 → 5，先选择 VctA 等变量以及二维/三维，再逐格输入分量。',[44,6]]],note:'对应章节为第 33、42、47、51 页。统计、基数、矩阵和向量模式自动采用线性输入/小数输出；不要套用普通计算的分数模板步骤。' },
	{ id:'errors',category:'入门',title:'错误提示与返回表达式',tags:'错误 Syntax ERROR Math ERROR 无法计算 复位',page:58,manualSection:'错误（第 58–61 页）',precondition:'出现错误时，先决定保留算式并定位错误，还是清除本次输入。',steps:[['需要修改算式：按「左」或「右」返回表达式，光标会停在出错位置，然后修正。',[46,47]],['需要放弃本次算式：按 AC 清除错误与计算内容。',[4]],['Math ERROR 检查定义域、除以 0 和计算范围；Syntax ERROR 检查语法、括号和参数。',[]]],note:'错误不等于需要全部初始化。重新开机、重置设置和全部初始化的作用不同；全部初始化会删除存储数据。' },
];

if(typeof document!=='undefined') {
	const guide=document.getElementById('guide'),toggle=document.getElementById('guide-toggle'),close=document.getElementById('guide-close');
	function setGuide(open) {
		guide.hidden=!open;document.body.classList.toggle('guide-open',open);toggle.setAttribute('aria-expanded',String(open));
		document.getElementById('calculator').inert=open && !document.body.classList.contains('tablet-layout');
		document.dispatchEvent(new Event('guide-visibility'));
		(open ? close : toggle).focus({preventScroll:true});
	}
	toggle.addEventListener('click',()=>setGuide(guide.hidden));close.addEventListener('click',()=>setGuide(false));
	window.addEventListener('resize',()=>{document.getElementById('calculator').inert=!guide.hidden && !document.body.classList.contains('tablet-layout');});
	document.addEventListener('keydown',event=>{
		if(event.key==='Escape' && !guide.hidden){setGuide(false);event.preventDefault();event.stopImmediatePropagation();}
	},true);
	const list=document.getElementById('guide-list'),filters=document.getElementById('guide-filters');
	const categories=['全部','入门','常用计算','函数与设置','方程与数据','更多模式'];
	let selected='全部',timer;
	function clearLocator() {
		clearTimeout(timer);document.querySelectorAll('.guide-target').forEach(key=>key.classList.remove('guide-target'));
		document.getElementById('guide-location').textContent='';
	}
	document.addEventListener('calculator-key',clearLocator);
	const keyNames=['7','8','9','DEL','AC','4','5','6','×','÷','1','2','3','+','−','0','.','×10ˣ','Ans','=','分数','√','x²','xʸ','log','ln','(−)','°′″','x⁻¹','sin','cos','tan','STO','ENG','(',')','S⇔D','M+','OPTN','CALC','积分','x','SHIFT','ALPHA','菜单','ON','左','右','上','下'];
	for(const category of categories) {
		const button=document.createElement('button'); button.type='button';button.textContent=category;
		button.setAttribute('aria-pressed',String(category===selected));
		button.addEventListener('click',()=>{selected=category;for(const b of filters.children)b.setAttribute('aria-pressed',String(b===button));render();});filters.append(button);
	}
	function render() {
		const query=document.getElementById('guide-search').value.trim().toLowerCase();
		const visible=topics.filter(topic=>(selected==='全部'||topic.category===selected)&&[topic.title,topic.tags,topic.formula,topic.note,...topic.steps.map(step=>step[0])].join(' ').toLowerCase().includes(query));
		list.replaceChildren();document.getElementById('guide-count').textContent=`${visible.length} 项`;
		document.getElementById('guide-empty').hidden=visible.length>0;
		for(const [index,topic] of visible.entries()) {
			const details=document.createElement('details');details.className='guide-entry';
			const summary=document.createElement('summary'),title=document.createElement('span'),page=document.createElement('span');
			title.textContent=topic.title;page.className='entry-page';page.textContent=`P.${String(topic.page).padStart(2,'0')}`;summary.append(title,page);details.append(summary);
			const content=document.createElement('div');content.className='entry-content';
			const condition=document.createElement('p');condition.className='entry-note';condition.textContent=`操作前：${topic.precondition}`;content.append(condition);
			if(topic.formula){const formula=document.createElement('p');formula.className='formula';formula.textContent=topic.formula;content.append(formula);}
			const steps=document.createElement('ol');
			for(const [text,keys] of topic.steps) {
				const step=document.createElement('li'),description=document.createElement('p');description.textContent=text;step.append(description);
				if(keys.length){const sequence=document.createElement('div');sequence.className='key-sequence';sequence.setAttribute('aria-label','正文中提到的按键；点击只定位');
					for(const key of keys){const b=document.createElement('button');b.type='button';b.textContent=keyNames[key];b.dataset.guideKey=key;b.setAttribute('aria-label',`定位 ${keyNames[key]} 按键（不输入）`);if(key===42)b.className='shift-chip';if(key===43)b.className='alpha-chip';sequence.append(b);}step.append(sequence);}
				steps.append(step);
			}
			content.append(steps);const note=document.createElement('p');note.className='entry-note';note.textContent=topic.note;content.append(note);
			const citation=document.createElement('p');citation.className='manual-reference';
			const link=document.createElement('a');link.href=`${manual.url}#page=${topic.page+1}`;link.target='_blank';link.rel='noopener noreferrer';link.textContent=`官方说明书 · 第 ${topic.page} 页起：${topic.manualSection}`;citation.append(link);content.append(citation);
			details.append(content);list.append(details);
		}
	}
	list.addEventListener('click',event=>{
		const chip=event.target.closest('[data-guide-key]');if(!chip)return;
		clearLocator();
		const key=document.querySelector(`#keys [data-index="${chip.dataset.guideKey}"]`);
		const location=document.getElementById('guide-location');
		if(!key){location.textContent='计算器尚未就绪，请稍后再定位。';return;}
		key.classList.add('guide-target');document.querySelector(`#pad-functions [data-index="${chip.dataset.guideKey}"],#pad-numbers [data-index="${chip.dataset.guideKey}"]`)?.classList.add('guide-target');location.textContent=`已标出「${chip.textContent}」的位置，未输入按键。`;
		if(!document.body.classList.contains('tablet-layout'))setGuide(false);
		timer=setTimeout(()=>{document.querySelectorAll('.guide-target').forEach(element=>element.classList.remove('guide-target'));location.textContent='';},5000);
	});
	document.getElementById('guide-search').addEventListener('input',render);render();
}
