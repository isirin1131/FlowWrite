#import "@preview/basic-document-props:0.1.0": simple-page
#show: simple-page.with("折彩", "", middle-text: "FlowWrite 产品设计文档", date: true, numbering: true, supress-mail-link: false)

#set text(font: ("Sarasa Fixed Slab SC"), lang:("zh"))
#show math.equation: set text(font: "Neo Euler")

这个项目同时作为毕业设计和我自用的小工具，规模肯定不会很大，性能和兼容性都可以降低优先级，主要就是实现功能。那么本文档主要聚焦的也是功能的设计。

#outline()


#line(length: 100%)
= Vision

很简单，这个产品的 vision 是服务于 AI 辅助的文字工作，包括写小说啊，改文案啊。

== intro

最初想要做这个产品，是我在不断调整我的同人小说生成 prompt 时，觉得到处复制来复制去很麻烦（当然也有当时我是在手机上操作的原因），于是想要一个专门用来编辑 prompt 的软件，要有存储啊，全局剪贴板啊这些东西。当时也构想了要对文本的插入、删除和修改啥的做一些图形化的适配，但后来我觉得如果用电脑，要不要加入对 vim 的适配？这个方面还是待讨论

所以这个产品一定会有文字编辑体验上的设计，而且可能之后会膨胀到一个比较 heavy 的地步。（要不要有 vim 呢？）

== more

后来我思考 ai 写作这件事，发现如果把作品本身放到最高优先级（而不是量产效率），那么即使是 ai 写作也很难有一个固定的流程，人工筛选和干预的步骤不仅一定会有，而且还可能是多样的。

所以就想实现一个 only-text 的 comfy-ui，这种软件按理说应该早就有了，但我还没刷到过。

而且由于这个产品也想做 prompt 编辑方面的体验设计，我想这两者的结合点也会有一些惊喜。

#line(length: 100%)
= design

由于 svelte flow 的基本设计就是点击 node 后 Backspace 可以删除 node（而且之后我也想添加 vim 支持），所以产品的全局设计里要鼓励键盘快捷键的使用。

== 基本组件

=== 文本块

单击可以选中，选中时可以 Ctrl-C 复制。

双击可以编辑具体内容。

=== 文本块列表

单击可以选中，选中时可以 Ctrl-C 复制。

可以插入文本块（具体交互需进一步设计）

#line(length: 50%, start: (20%, 0%), stroke: (dash: "dash-dotted"))

== 全局组件

=== 全局实时剪贴板

会记录用户所有的 Ctrl-C 行为涉及的对象，如文本块和文本块列表，还包括在编辑文本块时复制的文字。

用户可以手动添加在别的地方复制来的文字。

每个品类将只保存最近的 300 条记录。

=== 持久化的剪贴板内容

其实就是数据库。