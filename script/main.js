$(document).ready(function () {
	//初始化主要是对公共数据与方法的初始化
	var ME = {
		//默认设置
		DEFAULT: {
			//（0~255）好像是用于边缘检测用的，亮度的只是值，越小越详细
			EDGE_DETECT_VALUE: 80,
			//边缘上的点的生成的分布比率
			POINT_RATE: 0.075,
			//随机取样点的个数越多越详细，但不一定好
			POINT_MAX_NUM: 4500,
			//边缘模糊的大小
			BLUR_SIZE: 2,
			//边缘取样的个数
			EDGE_SIZE: 6,
			//图片的像素值
			PIXEL_LIMIT: 8000000
		},
		USE: {
			beginTime: null,
			endTime: null,
			sourceImg: null,
			canvas: null,
			context: null,
			imgData: [],
			origin: {}
		},
		DOM: {
			$sourceWrapper: $('#source-wrapper'),
			$sourceInput: $('#source-input'),
			$imgWrapper: $('#img-wrapper'),
			$setWrapper: $('#set-wrapper'),
			$setInputs: $('#set-wrapper>input'),
			$runBtn: $('#run-btn'),
			$prompt: $('#prompt')
		},
		METHODS: {},
		WOK: {}
	};
	// 线程生成方法姑且写成一个工厂方法，目前只用到一个线程
	ME.METHODS.FactoryWorker = function (workerUrl) {
		if (!window.Worker) return alert('您的浏览器不支持worker');
		var worker = new Worker(workerUrl),
			$event = $({});
		worker.onmessage = function (event) {
				var EData = event.data,
					type = EData.type,
					data = EData.data;
				$event.trigger(type, data);
			}
			// 加上一层包装用于与线程通讯
		return {
			emit: function (type, data) {
				worker.postMessage({
					type: type,
					data: data
				});
			},
			on: function (type, fn) {
				$event.on(type, fn);
			},
			off: function (type, fn) {
				$event.off(type, fn);
			}
		};
	};

	//设置input默认的选项值
	ME.METHODS.setDeault = function () {
		var set = ME.DEFAULT,
			key = null,
			value = null;
		ME.DOM.$setInputs.each(function (i, item) {
			key = item.name;
			value = set[key];
			if (!value) return;
			item.value = value;
		});
	};
	//更新选项值
	ME.METHODS.updateDefault = function () {
		var set = ME.DEFAULT,
			key = null,
			value = null;
		ME.DOM.$setInputs.each(function (i, item) {
			key = item.name;
			value = item.value;
			if (!set[key]) return;
			set[key] = value;
		});
	};
	//用于设置拖拽图片的的源
	ME.METHODS.loadImg = function (src, callback) {
		//这里使用了代理可以获取到图片的原始数据
		var tempImg = new Image();
		tempImg.src = src;
		tempImg.onload = function (event) {
			//这边只是用于预览用的
			ME.DOM.$imgWrapper.prop('src', src);
			//传入的原始是图片数据
			callback(tempImg);
		}

	}

	//用与生成通用createURL
	ME.METHODS.createUrl = (function () {
		return window.createObjectURL || window.URL.createObjectURL || window.webkitURL.createObjectURL || alert('浏览器器太久了，改换了');
	})();


	//用于获取图片的源路径
	ME.METHODS.getImgSrc = function (source) {
		var type = source.type.substr(0, 5);
		if (type !== 'image') return console.log('老大要图片啦！');
		return ME.METHODS.createUrl(source);
	}


	//用于设置图片的属性
	ME.METHODS.setImg = function (img) {
			var width = img.width,
				height = img.height,
				pixelNum = width * height,
				pixelLimit = ME.DEFAULT.PIXEL_LIMIT;
			if (pixelNum > pixelLimit) {
				var scale = Math.sqrt(pixelLimit / pixelNum);
				img.width = width * scale | 0;
				img.height = height * scale | 0;
			}
			ME.USE.origin.width = img.width;
			ME.USE.origin.height = img.height;
			ME.USE.sourceImg = img;

		}
		//预览图片的居中显示
	ME.METHODS.setImgInMiddle = function (img) {
		var width = img.width,
			height = img.height,
			set = width > height ? {
				width: '90%',
				height: 'auto'
			} : {
				height: '90%',
				width: 'auto'
			};
		ME.DOM.$imgWrapper.css(set);
	}


	//提示面板的消息设置
	ME.METHODS.updatePrompt = function (msg) {
		ME.DOM.$prompt.text(msg);
	};
	ME.METHODS.onPrompt = function (state) {
		return state && ME.DOM.$prompt.fadeIn('slow') || ME.DOM.$prompt.fadeOut('slow');
	};
	//达夫设备
	ME.METHODS.duff = function (dataArr) {
		var iterations = (dataArr.length / 8) | 0,
			leftover = dataArr.length % 8,
			i = 0;
		return function (handle) {
			if (leftover > 0) {
				do {
					handle(dataArr[i++]);
				} while (--leftover > 0);
			}
			do {
				handle(dataArr[i++]);
				handle(dataArr[i++]);
				handle(dataArr[i++]);
				handle(dataArr[i++]);
				handle(dataArr[i++]);
				handle(dataArr[i++]);
				handle(dataArr[i++]);
				handle(dataArr[i++]);
			} while (--iterations > 0);
		}
	};
	//通过canvas序列化图片数据
	ME.METHODS.getImgData = (function () {
		ME.USE.canvas = document.createElement('canvas');
		var context = ME.USE.context = ME.USE.canvas.getContext('2d');
		return function (img) {
			var width = ME.USE.canvas.width = ME.USE.origin.width,
				height = ME.USE.canvas.height = ME.USE.origin.height,
				imgData = null;
			context.drawImage(img, 0, 0, width, height);
			imgData = context.getImageData(0, 0, width, height);
			return imgData;
		}
	})();
	//将处理后的图片显示
	/*ME.METHODS.render = function () {
	var context = ME.USE.context,
		item, p0, p1, p2, fc;
	return function renderGo(renderData) {
		if (renderData.length === 0) return;
		item = renderData.shift();
		p0 = item.p0;
		p1 = item.p1;
		p2 = item.p2;
		fc = item.fc;
		context.beginPath();
		context.moveTo(p0.x, p0.y);
		context.lineTo(p1.x, p1.y);
		context.lineTo(p2.x, p2.y);
		context.lineTo(p0.x, p0.y);
		context.fillStyle = fc;
		context.fill();
		renderGo(renderData);
	}
};*/
	//canvas渲染
	ME.METHODS.render = function (renderData) {
		var context = ME.USE.context,
			p0, p1, p2, fc;
		//duff设循环展开
		ME.METHODS.duff(renderData)(function (item) {
			p0 = item.p0;
			p1 = item.p1;
			p2 = item.p2;
			fc = item.fc;
			context.beginPath();
			context.moveTo(p0.x, p0.y);
			context.lineTo(p1.x, p1.y);
			context.lineTo(p2.x, p2.y);
			context.lineTo(p0.x, p0.y);
			context.fillStyle = fc;
			context.fill();
		});

	};
	//将处理后的图片显示
	ME.METHODS.drawImg = function () {
		var img = ME.DOM.$imgWrapper.get(0);
		img.src = ME.USE.canvas.toDataURL('image/png');
	};
	//上面是一些预先定义的方法
	/*----------------------------------------------------------------------*/
	//下面是正式处理程序



	ME.WOK = ME.METHODS.FactoryWorker('./script/canvasDataWorker.js');
	//	ME.WOK = ME.METHODS.FactoryWorker('./script/handleWorker.js');
	//文件输入框选择图片
	ME.DOM.$sourceInput.on('change', function (event) {
		if (!this.value) return;
		var src = ME.METHODS.getImgSrc(this.files[0]);
		ME.METHODS.loadImg(src, function (img) {
			ME.METHODS.setImg(img);
			ME.METHODS.setImgInMiddle(img);
		});
	});


	//或者拖拽文件进行选择
	ME.DOM.$sourceWrapper.on('dorp', function (event) {
		event.preventDefault();
		event.stopPropagation();
		var source = event.originalEvent.dataTransfer.files[0],
			src = ME.METHODS.getImgSrc(source);
		ME.METHODS.loadImg(src, function (img) {
			ME.METHODS.setImg(img);
			ME.METHODS.setImgInMiddle(img);
		});
	});


	//点击执行
	ME.DOM.$runBtn.on('click', function (event) {
		if (!ME.USE.sourceImg) {
			ME.METHODS.setImg(ME.DOM.$imgWrapper.get(0));
		}
		ME.METHODS.updateDefault();
		ME.METHODS.onPrompt(true);
		ME.METHODS.updatePrompt('开始处理图片');
		ME.USE.beginTime = +new Date();
		ME.USE.imgData = ME.METHODS.getImgData(ME.USE.sourceImg);
		ME.WOK.emit('run', {
			set: ME.DEFAULT,
			imgData: ME.USE.imgData
		});
		ME.USE.imgData = null;
	});



	//消息提示
	ME.WOK.on('msg', function (event, data) {
		ME.METHODS.updatePrompt(data.msg);
	});
	//分片处理，效果不太好
	/*var item = null,
		queue = [];
	ME.WOK.on('render', function (event, data) {
		if (item) {
			queue.push(data.renderData);
		} else {
			(function toRender(data) {
				ME.METHODS.updatePrompt('开始渲染图片片段:' + data.index);
				ME.METHODS.render(data.renderData);
				if (queue.length === 0) return item = null;
				item = queue.shift();
				toRender(item);
			})(data);
		}
	});

	ME.WOK.on('renderOk', function (event) {
		ME.METHODS.drawImg();
		ME.USE.endTime = +new Date();
		console.log('用时：' + (ME.USE.endTime - ME.USE.beginTime) + 'ms');
		ME.METHODS.onPrompt(false);
	});*/
	ME.WOK.on('ok', function (event, data) {
		ME.METHODS.updatePrompt('woker处理完成，开始渲染图片');
		ME.METHODS.render(data.renderData);
		ME.METHODS.drawImg();
		ME.USE.endTime = +new Date();
		console.log('用时：' + (ME.USE.endTime - ME.USE.beginTime) + 'ms');
		ME.METHODS.onPrompt(false);

	});
	ME.METHODS.setDeault();

});
