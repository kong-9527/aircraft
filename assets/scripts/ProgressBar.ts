import { _decorator, Component, Node, Prefab, instantiate, Vec3, director } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('ProgressBar')
export class ProgressBar extends Component {
    @property({ type: Prefab })
    fillCellPrefab: Prefab = null;

    @property({ type: Node })
    fillsContainer: Node = null;

    @property
    totalCells: number = 20;

    private cells: Node[] = [];
    private progress: number = 0; // 0~1
    private duration: number = 5; // 5秒
    private elapsed: number = 0;

    start() {
        this.createCells(0);
        this.progress = 0;
        this.elapsed = 0;
    }

    update(dt: number) {
        if (this.progress >= 1) return;

        this.elapsed += dt;
        this.progress = Math.min(this.elapsed / this.duration, 1);

        // 计算当前应该显示多少个方块
        const showCount = Math.round(this.progress * this.totalCells);
        this.createCells(showCount);

        if (this.progress >= 1) {
            // 加载完成，切换场景
            this.scheduleOnce(() => {
                director.loadScene('MainMenu');
            }, 0.3);
        }
    }

    createCells(count: number) {
        // 只创建需要显示的数量
        while (this.cells.length < count) {
            const cell = instantiate(this.fillCellPrefab);
            // 设置位置
            const idx = this.cells.length;
            cell.setPosition(new Vec3(idx * (29 - 6), 0, 0)); // 29px宽，-6px间距
            this.fillsContainer.addChild(cell);
            this.cells.push(cell);
        }
        // 隐藏多余的
        for (let i = 0; i < this.cells.length; i++) {
            this.cells[i].active = i < count;
        }
    }
}