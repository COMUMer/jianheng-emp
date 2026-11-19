import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TitleComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import type { EChartsOption } from 'echarts';
import './echart.css';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, SVGRenderer]);

/** 图表唯一入口：在这里注册用到的图表类型与组件，调用方只关心 option。 */
export function EChart({ option, label }: { option: EChartsOption; label: string }) {
    return <div className="echart" role="img" aria-label={label}>
        <ReactEChartsCore echarts={echarts} option={option} notMerge lazyUpdate
            style={{ height: '100%', width: '100%' }} opts={{ renderer: 'svg' }} />
    </div>;
}
