// 创建一个8字节的ArrayBuffer
var b = new ArrayBuffer(8);

// 创建一个指向b的Int32视图，开始于字节0，直到缓冲区的末尾
var v1 = new Int32Array(b);

// 创建一个指向b的Uint8视图，开始于字节2，直到缓冲区的末尾
var v2 = new Uint8Array(b);

// 创建一个指向b的Int16视图，开始于字节2，长度为2
var v3 = new Int16Array(b);
console.log('v1',v1);
console.log('v2',v2);
console.log('v3',v3);
