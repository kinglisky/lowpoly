var W = (function () {
	var onEventList = {};
	var Self = self;
	Self.onmessage = function (event) {
		var data = event.data,
			eType = data.type,
			eData = data.data;
		W.trigger(eType, eData);
	}
	return {
		/*与主线程通讯的事件*/
		emit: function (eType, data) {
			Self.postMessage({
				type: eType,
				data: data
			});
		},
		on: function (eType, handle) {
			if (!onEventList[eType]) {
				onEventList[eType] = [];
			}
			onEventList[eType].push(handle);
		},
		trigger: function (eType) {
			var fns = onEventList[eType],
				data = Array.prototype.slice.call(arguments, 1);
			if (!fns || fns.length === 0) {
				return false;
			}
			for (var i = 0, fn; fn = fns[i++];) {
				fn.apply(this, data);
			}
		},
		off: function (eType, fn) {
			var fns = onEventList[eType];
			if (!fns) {
				return false;
			}
			if (!fn) {
				fns && (fns.length = 0);
			} else {
				for (var len = fns.length - 1; len >= 0; len--) {
					var _fn = fns[len];
					if (_fn === fn) {
						fns.splice(len, 1);
					}
				}
			}
		}
	}
}());
var Filter = {

	/**
	 * 取每个像素点的颜色的平均值
	 */
	grayscaleFilterR: function (imageData) {
		var width = imageData.width | 0;
		var height = imageData.height | 0;
		var data = imageData.data;

		var x, y;
		var i, step;
		var r, g, b;

		for (y = 0; y < height; y++) {
			step = y * width;

			for (x = 0; x < width; x++) {
				i = (x + step) << 2;
				r = data[i];
				g = data[i + 1];
				b = data[i + 2];

				data[i] = (Math.max(r, g, b) + Math.min(r, g, b)) >> 2;
			}
		}

		return imageData;
	},

	/**
	 * 畳み込みフィルタ, ソース用なので 1 チャンネル (Red) のみに
	 *
	 * @see http://jsdo.it/akm2/iMsL
	 */
	convolutionFilterR: function (matrix, imageData, divisor) {
		matrix = matrix.slice();
		divisor = divisor || 1;

		// 割る数を行列に適用する
		var divscalar = divisor ? 1 / divisor : 0;
		var k, len;
		if (divscalar !== 1) {
			for (k = 0, len = matrix.length; k < matrix.length; k++) {
				matrix[k] *= divscalar;
			}
		}

		var data = imageData.data;

		// 参照用にオリジナルをコピー, グレースケールなので Red チャンネルのみ
		len = data.length >> 2;
		var copy = new Uint8Array(len);
		for (i = 0; i < len; i++) copy[i] = data[i << 2];

		var width = imageData.width | 0;
		var height = imageData.height | 0;
		var size = Math.sqrt(matrix.length);
		var range = size * 0.5 | 0;

		var x, y;
		var r, g, b, v;
		var col, row, sx, sy;
		var i, istep, jstep, kstep;

		for (y = 0; y < height; y++) {
			istep = y * width;

			for (x = 0; x < width; x++) {
				r = g = b = 0;

				for (row = -range; row <= range; row++) {
					sy = y + row;
					jstep = sy * width;
					kstep = (row + range) * size;

					if (sy >= 0 && sy < height) {
						for (col = -range; col <= range; col++) {
							sx = x + col;

							if (
								sx >= 0 && sx < width &&
								(v = matrix[(col + range) + kstep]) // 値が 0 ならスキップ
							) {
								r += copy[sx + jstep] * v;
							}
						}
					}
				}

				// 値を挟み込む
				if (r < 0) r = 0;
				else if (r > 255) r = 255;

				data[(x + istep) << 2] = r & 0xFF;
			}
		}

		return imageData;
	},

	getEdgePoint: function (imageData) {
		var width = imageData.width;
		var height = imageData.height;
		var data = imageData.data;

		var E = BASE.set.EDGE_DETECT_VALUE; // local copy

		var points = [];
		var x, y, row, col, sx, sy, step, sum, total;

		for (y = 0; y < height; y++) {
			for (x = 0; x < width; x++) {
				sum = total = 0;

				for (row = -1; row <= 1; row++) {
					sy = y + row;
					step = sy * width;
					if (sy >= 0 && sy < height) {
						for (col = -1; col <= 1; col++) {
							sx = x + col;

							if (sx >= 0 && sx < width) {
								sum += data[(sx + step) << 2];
								total++;
							}
						}
					}
				}

				if (total) sum /= total;
				if (sum > E) points.push(new Array(x, y));
			}
		}

		return points;
	}

};
var Delaunay = (function () {

	/**
	 * Node
	 *
	 * @param {Number} x
	 * @param {Number} y
	 * @param {Number} id
	 */
	function Node(x, y, id) {
		this.x = x;
		this.y = y;
		this.id = !isNaN(id) && isFinite(id) ? id : null;
	}

	Node.prototype = {
		eq: function (p) {
			var dx = this.x - p.x;
			var dy = this.y - p.y;
			return (dx < 0 ? -dx : dx) < 0.0001 && (dy < 0 ? -dy : dy) < 0.0001;
		},

		toString: function () {
			return '(x: ' + this.x + ', y: ' + this.y + ')';
		}
	};

	/**
	 * Edge
	 *
	 * @param {Node} p0
	 * @param {Node} p1
	 */
	function Edge(p0, p1) {
		this.nodes = [p0, p1];
	}

	Edge.prototype = {
		eq: function (edge) {
			var na = this.nodes,
				nb = edge.nodes;
			var na0 = na[0],
				na1 = na[1],
				nb0 = nb[0],
				nb1 = nb[1];
			return (na0.eq(nb0) && na1.eq(nb1)) || (na0.eq(nb1) && na1.eq(nb0));
		}
	};

	/**
	 * Triangle
	 *
	 * @param {Node} p0
	 * @param {Node} p1
	 * @param {Node} p2
	 */
	function Triangle(p0, p1, p2) {
		this.nodes = [p0, p1, p2];
		this.edges = [new Edge(p0, p1), new Edge(p1, p2), new Edge(p2, p0)];

		// 今回は id は使用しない
		this.id = null;

		// この三角形の外接円を作成する

		var circle = this.circle = new Object();

		var ax = p1.x - p0.x,
			ay = p1.y - p0.y,
			bx = p2.x - p0.x,
			by = p2.y - p0.y,
			t = (p1.x * p1.x - p0.x * p0.x + p1.y * p1.y - p0.y * p0.y),
			u = (p2.x * p2.x - p0.x * p0.x + p2.y * p2.y - p0.y * p0.y);

		var s = 1 / (2 * (ax * by - ay * bx));

		circle.x = ((p2.y - p0.y) * t + (p0.y - p1.y) * u) * s;
		circle.y = ((p0.x - p2.x) * t + (p1.x - p0.x) * u) * s;

		var dx = p0.x - circle.x;
		var dy = p0.y - circle.y;
		circle.radiusSq = dx * dx + dy * dy;
	}


	/**
	 * Delaunay
	 *
	 * @param {Number} width
	 * @param {Number} height
	 */
	function Delaunay(width, height) {
		this.width = width;
		this.height = height;

		this._triangles = null;

		this.clear();
	}

	Delaunay.prototype = {

		clear: function () {
			var p0 = new Node(0, 0);
			var p1 = new Node(this.width, 0);
			var p2 = new Node(this.width, this.height);
			var p3 = new Node(0, this.height);

			this._triangles = [
                    new Triangle(p0, p1, p2),
                    new Triangle(p0, p2, p3)
                ];

			return this;
		},

		insert: function (points) {
			var k, klen, i, ilen, j, jlen;
			var triangles, t, temps, edges, edge, polygon;
			var x, y, circle, dx, dy, distSq;

			for (k = 0, klen = points.length; k < klen; k++) {
				x = points[k][0];
				y = points[k][1];

				triangles = this._triangles;
				temps = [];
				edges = [];

				for (ilen = triangles.length, i = 0; i < ilen; i++) {
					t = triangles[i];

					// 座標が三角形の外接円に含まれるか調べる
					circle = t.circle;
					dx = circle.x - x;
					dy = circle.y - y;
					distSq = dx * dx + dy * dy;

					if (distSq < circle.radiusSq) {
						// 含まれる場合三角形の辺を保存
						edges.push(t.edges[0], t.edges[1], t.edges[2]);
					} else {
						// 含まれない場合は持ち越し
						temps.push(t);
					}
				}

				polygon = [];

				// 辺の重複をチェック, 重複する場合は削除する
				edgesLoop: for (ilen = edges.length, i = 0; i < ilen; i++) {
					edge = edges[i];

					// 辺を比較して重複していれば削除
					for (jlen = polygon.length, j = 0; j < jlen; j++) {
						if (edge.eq(polygon[j])) {
							polygon.splice(j, 1);
							continue edgesLoop;
						}
					}

					polygon.push(edge);
				}

				for (ilen = polygon.length, i = 0; i < ilen; i++) {
					edge = polygon[i];
					temps.push(new Triangle(edge.nodes[0], edge.nodes[1], new Node(x, y)));
				}

				this._triangles = temps;
			}

			return this;
		},

		getTriangles: function () {
			return this._triangles.slice();
		}
	};

	Delaunay.Node = Node;

	return Delaunay;

})();
var METHODS = {
	//duff设备用于循环展开
	duff: function (dataArr) {
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
	},
	//数组分批次执行
	shunt: function (arr) {
		var shuntSize = 8000,
			len = (arr.length / shuntSize) | 0,
			right = arr.length % shuntSize,
			cursorIndex = 0,
			shuntArr = [];
		for (var i = 0; i < len; i++) {
			shuntArr.push(arr.slice(cursorIndex, cursorIndex += shuntSize));
		}
		shuntArr.push(arr.slice(-right));
		arr = null;
		i = 0;
		return function (progress, end) {
			while (shuntArr.length > 1) {
				progress(shuntArr.shift(), i++);
			}
			progress(shuntArr.shift(), i++);
			end();
		}
	}
};
var BASE = {
	shuntSize: 2000,
	set: null,
	blur: null,
	edge: null,
	imgData: null,
	colorData: null

}
var To = {
	init: function (set, imgData) {
		BASE.set = set;
		//模糊处理矩阵
		BASE.blur = (function (size) {
			var matrix = [];
			var side = size * 2 + 1;
			var i, len = side * side;
			for (i = 0; i < len; i++) matrix[i] = 1;
			return matrix;
		})(set.BLUR_SIZE);

		// 边缘识别矩阵
		BASE.edge = (function (size) {
			var matrix = [];
			var side = size * 2 + 1;
			var i, len = side * side;
			var center = len * 0.5 | 0;
			for (i = 0; i < len; i++) matrix[i] = i === center ? -len + 1 : 1;
			return matrix;
		})(set.EDGE_SIZE);

		BASE.imgData = imgData;
		BASE.colorData = Array.prototype.slice.call(imgData.data);

	},
	do: function () {
		var set = BASE.set,
			imageData = BASE.imgData,
			width = imageData.width,
			height = imageData.height,
			blur = BASE.blur,
			edge = BASE.edge;
		//过滤器用于处理图片的数据
		W.emit('msg',{msg:'分离颜色通道'});
		Filter.grayscaleFilterR(imageData);
		W.emit('msg',{msg:'边缘模糊处理'});
		Filter.convolutionFilterR(blur, imageData, blur.length);
		W.emit('msg',{msg:'边缘检测分离'});
		Filter.convolutionFilterR(edge, imageData);
		// 检测边缘上的点
		W.emit('msg',{msg:'获取边界识别后的随机取样点'});
		var temp = Filter.getEdgePoint(imageData),
			detectionNum = temp.length,
			points = [];
		var i = 0,
			ilen = temp.length,
			tlen = ilen,
			j, limit = Math.round(ilen * set.POINT_RATE);
		if (limit > set.POINT_MAX_NUM) limit = set.POINT_MAX_NUM;

		// 随机取样
		while (i < limit && i < ilen) {
			j = tlen * Math.random() | 0;
			points.push(temp[j]);
			temp.splice(j, 1);
			tlen--;
			i++;
		}

		// 三角形分割
		W.emit('msg',{msg:'delaunay 三角形分割'});
		var delaunay = new Delaunay(width, height),
			colorData = BASE.colorData,
			triangles = [],
			renderData = [],
			p0, p1, p2, cx, cy, cindex, fc;
		//分片处理数据
		/*METHODS.shunt(points)(function (points, index) {
			triangles = delaunay.insert(points).getTriangles();
			//生成渲染用的数据
			//达夫设备展开
			METHODS.duff(triangles)(function (item) {
				p0 = item.nodes[0];
				p1 = item.nodes[1];
				p2 = item.nodes[2];
				cx = (p0.x + p1.x + p2.x) * 0.33333;
				cy = (p0.y + p1.y + p2.y) * 0.33333;
				cindex = ((cx | 0) + (cy | 0) * width) << 2;
				fc = 'rgb(' + colorData[cindex] + ', ' + colorData[cindex + 1] + ', ' + colorData[cindex + 2] + ')';
				renderData.push({
					p0: p0,
					p1: p1,
					p2: p2,
					fc: fc
				});
			});
			W.emit('render', {
				index: index,
				renderData: renderData
			});
			renderData = [];
			triangles = [];
		}, function () {
			W.emit('renderOk');
		});*/
		triangles = delaunay.insert(points).getTriangles();
		W.emit('msg',{msg:'生成渲染用的数据'});
		METHODS.duff(triangles)(function (item) {
			p0 = item.nodes[0];
			p1 = item.nodes[1];
			p2 = item.nodes[2];
			cx = (p0.x + p1.x + p2.x) * 0.33333;
			cy = (p0.y + p1.y + p2.y) * 0.33333;
			cindex = ((cx | 0) + (cy | 0) * width) << 2;
			fc = 'rgb(' + colorData[cindex] + ', ' + colorData[cindex + 1] + ', ' + colorData[cindex + 2] + ')';
			renderData.push({
				p0: p0,
				p1: p1,
				p2: p2,
				fc: fc
			});
		});
		W.emit('ok', {
			renderData: renderData
		});


	}


}


W.on('run', function (data) {
	console.log(data.imgData);
	To.init(data.set, data.imgData);
	To.do();
	/*W.emit('ok', {
		renderData: renderData
	});*/
});
console.log('耶耶耶~~~线程正常运行！');
