"""
1980 Coffee — Advanced Analytics Dashboard
Connects to MongoDB Atlas, pulls live data, generates interactive charts.
Run: python analytics/dashboard.py
Requires: pip install pymongo pandas plotly dash python-dotenv
"""

import os
import sys
from datetime import datetime, timedelta
from dotenv import load_dotenv
import pandas as pd
from pymongo import MongoClient
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import dash
from dash import dcc, html, Input, Output, callback
import dash_bootstrap_components as dbc

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../.env'))

# ─── MongoDB Connection ────────────────────────────────────────────
MONGO_URI = os.getenv('MONGODB_URI')
if not MONGO_URI:
    print("ERROR: MONGODB_URI not set in .env"); sys.exit(1)

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client['1980coffee']
orders_col = db['orders']
users_col = db['users']
audit_col = db['auditlogs']

# ─── Color Palette (matches the website) ─────────────────────────
COLORS = {
    'espresso': '#1a0f07',
    'dark_roast': '#2d1a0e',
    'gold': '#c8952a',
    'amber': '#e8a830',
    'cream': '#f5ead8',
    'warm_gray': '#8a7d6e',
    'success': '#4ade80',
    'danger': '#f87171',
    'info': '#60a5fa',
}

TEMPLATE = dict(
    layout=go.Layout(
        paper_bgcolor='rgba(0,0,0,0)',
        plot_bgcolor='rgba(45,26,14,0.3)',
        font=dict(color=COLORS['cream'], family='Georgia, serif'),
        title_font=dict(color=COLORS['amber'], size=18),
        xaxis=dict(gridcolor='rgba(200,149,42,0.1)', showgrid=True),
        yaxis=dict(gridcolor='rgba(200,149,42,0.1)', showgrid=True),
        colorway=[COLORS['amber'], COLORS['gold'], COLORS['cream'], COLORS['warm_gray']],
    )
)

# ─── Data Fetchers ─────────────────────────────────────────────────

def get_orders_df(days=30):
    since = datetime.utcnow() - timedelta(days=days)
    cursor = orders_col.find(
        {'createdAt': {'$gte': since}, 'status': {'$nin': ['cancelled']}},
        {'_id': 1, 'total': 1, 'type': 1, 'status': 1, 'createdAt': 1,
         'items': 1, 'payment': 1, 'customer': 1}
    )
    docs = list(cursor)
    if not docs:
        return pd.DataFrame()
    df = pd.json_normalize(docs)
    df['createdAt'] = pd.to_datetime(df['createdAt'])
    df['date'] = df['createdAt'].dt.date
    df['hour'] = df['createdAt'].dt.hour
    df['weekday'] = df['createdAt'].dt.day_name()
    return df


def get_kpis(df):
    if df.empty:
        return {k: 0 for k in ['total_revenue', 'total_orders', 'avg_order', 'today_revenue', 'today_orders']}
    today = datetime.utcnow().date()
    today_df = df[df['date'] == today]
    return {
        'total_revenue': df['total'].sum(),
        'total_orders': len(df),
        'avg_order': round(df['total'].mean(), 2),
        'today_revenue': today_df['total'].sum(),
        'today_orders': len(today_df),
    }

# ─── Chart Builders ────────────────────────────────────────────────

def revenue_chart(df):
    """Daily revenue bar + cumulative line chart."""
    if df.empty:
        return go.Figure().update_layout(**TEMPLATE['layout'].to_plotly_json())
    daily = df.groupby('date').agg(revenue=('total', 'sum'), orders=('total', 'count')).reset_index()
    daily['cumulative'] = daily['revenue'].cumsum()

    fig = make_subplots(specs=[[{"secondary_y": True}]])
    fig.add_trace(go.Bar(
        x=daily['date'], y=daily['revenue'],
        name='Daily Revenue (EGP)',
        marker_color=COLORS['amber'], opacity=0.85,
    ), secondary_y=False)
    fig.add_trace(go.Scatter(
        x=daily['date'], y=daily['cumulative'],
        name='Cumulative Revenue',
        line=dict(color=COLORS['cream'], width=2, dash='dot'),
        mode='lines+markers',
    ), secondary_y=True)
    fig.update_layout(
        title='Daily & Cumulative Revenue',
        **{k: v for k, v in TEMPLATE['layout'].to_plotly_json().items() if k not in ['updatemenus']},
        hovermode='x unified',
        legend=dict(orientation='h', y=-0.15),
    )
    fig.update_yaxes(title_text='EGP / Day', secondary_y=False)
    fig.update_yaxes(title_text='Cumulative EGP', secondary_y=True)
    return fig


def top_items_chart(df):
    """Horizontal bar chart of top-selling items."""
    if df.empty or 'items' not in df.columns:
        return go.Figure()
    rows = []
    for _, row in df.iterrows():
        items = row.get('items', [])
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    rows.append({'name': item.get('name', '?'), 'qty': item.get('qty', 1),
                                 'revenue': item.get('subtotal', 0)})
    if not rows:
        return go.Figure()
    items_df = pd.DataFrame(rows).groupby('name').agg(qty=('qty', 'sum'), revenue=('revenue', 'sum')).reset_index()
    items_df = items_df.nlargest(10, 'qty')

    fig = go.Figure(go.Bar(
        x=items_df['qty'], y=items_df['name'],
        orientation='h',
        marker=dict(
            color=items_df['revenue'],
            colorscale=[[0, COLORS['dark_roast']], [0.5, COLORS['gold']], [1, COLORS['amber']]],
            showscale=True,
            colorbar=dict(title='Revenue (EGP)', tickfont=dict(color=COLORS['cream']))
        ),
        text=items_df['qty'],
        textposition='outside',
    ))
    fig.update_layout(
        title='Top 10 Best-Selling Items',
        xaxis_title='Units Sold',
        **{k: v for k, v in TEMPLATE['layout'].to_plotly_json().items()},
        height=420,
    )
    return fig


def hourly_heatmap(df):
    """Heatmap: orders by hour × weekday."""
    if df.empty:
        return go.Figure()
    pivot = df.groupby(['weekday', 'hour']).size().reset_index(name='orders')
    weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    pivot['weekday'] = pd.Categorical(pivot['weekday'], categories=weekdays, ordered=True)
    pivot = pivot.sort_values('weekday')
    matrix = pivot.pivot(index='weekday', columns='hour', values='orders').fillna(0)

    fig = go.Figure(go.Heatmap(
        z=matrix.values,
        x=[f'{h:02d}:00' for h in matrix.columns],
        y=matrix.index.tolist(),
        colorscale=[[0, COLORS['espresso']], [0.5, COLORS['gold']], [1, COLORS['amber']]],
        hoverongaps=False,
        colorbar=dict(title='Orders', tickfont=dict(color=COLORS['cream']))
    ))
    fig.update_layout(
        title='Order Volume Heatmap (Hour × Day)',
        **{k: v for k, v in TEMPLATE['layout'].to_plotly_json().items()},
        height=350,
    )
    return fig


def order_type_pie(df):
    """Pie chart: dine-in vs takeaway vs delivery."""
    if df.empty or 'type' not in df.columns:
        return go.Figure()
    counts = df['type'].value_counts()
    fig = go.Figure(go.Pie(
        labels=counts.index, values=counts.values,
        hole=0.5,
        marker=dict(colors=[COLORS['amber'], COLORS['gold'], COLORS['cream']]),
        textfont=dict(color=COLORS['espresso']),
    ))
    fig.update_layout(
        title='Order Types',
        **{k: v for k, v in TEMPLATE['layout'].to_plotly_json().items()},
        showlegend=True,
        legend=dict(font=dict(color=COLORS['cream']))
    )
    return fig


def payment_method_chart(df):
    """Donut chart: payment method breakdown."""
    if df.empty:
        return go.Figure()
    pay_col = 'payment.method' if 'payment.method' in df.columns else None
    if not pay_col:
        return go.Figure()
    counts = df[pay_col].value_counts()
    fig = go.Figure(go.Pie(
        labels=counts.index, values=counts.values,
        hole=0.5,
        marker=dict(colors=[COLORS['amber'], COLORS['gold'], COLORS['warm_gray'], COLORS['cream']]),
    ))
    fig.update_layout(
        title='Payment Methods',
        **{k: v for k, v in TEMPLATE['layout'].to_plotly_json().items()},
    )
    return fig


def revenue_by_order_type(df):
    """Grouped bar: revenue split by order type per week."""
    if df.empty:
        return go.Figure()
    df2 = df.copy()
    df2['week'] = df2['createdAt'].dt.to_period('W').astype(str)
    pivot = df2.groupby(['week', 'type'])['total'].sum().reset_index()
    fig = px.bar(pivot, x='week', y='total', color='type', barmode='group',
                 color_discrete_sequence=[COLORS['amber'], COLORS['gold'], COLORS['cream']])
    fig.update_layout(
        title='Weekly Revenue by Order Type',
        **{k: v for k, v in TEMPLATE['layout'].to_plotly_json().items()},
    )
    return fig


# ─── Dash Application ──────────────────────────────────────────────
app = dash.Dash(
    __name__,
    external_stylesheets=[dbc.themes.DARKLY],
    title='1980 Coffee — Analytics',
)

CARD_STYLE = {
    'background': 'rgba(45,26,14,0.8)',
    'border': '1px solid rgba(200,149,42,0.25)',
    'borderRadius': '8px',
    'padding': '1.2rem',
    'marginBottom': '1rem',
}

KPI_STYLE = {**CARD_STYLE, 'textAlign': 'center'}

app.layout = dbc.Container(fluid=True, style={'background': '#1a0f07', 'minHeight': '100vh', 'padding': '2rem'}, children=[
    # Header
    dbc.Row([
        dbc.Col(html.Div([
            html.H1('1980 COFFEE', style={'fontFamily': 'Georgia', 'color': '#e8a830', 'letterSpacing': '0.2em', 'marginBottom': 0}),
            html.P('Advanced Analytics Dashboard', style={'color': '#8a7d6e', 'letterSpacing': '0.1em', 'marginTop': 0}),
        ]))
    ], className='mb-4'),

    # Date range filter
    dbc.Row([
        dbc.Col([
            html.Label('Date Range', style={'color': '#f5ead8', 'fontSize': '0.8rem', 'letterSpacing': '0.1em'}),
            dcc.Dropdown(
                id='date-range',
                options=[
                    {'label': 'Last 7 days', 'value': 7},
                    {'label': 'Last 30 days', 'value': 30},
                    {'label': 'Last 90 days', 'value': 90},
                ],
                value=30,
                clearable=False,
                style={'background': '#2d1a0e', 'color': '#f5ead8'},
            )
        ], width=3),
        dbc.Col([
            dbc.Button('🔄 Refresh', id='refresh-btn', color='warning', outline=True, size='sm', className='mt-4'),
        ], width=2),
    ], className='mb-4'),

    # KPIs
    dbc.Row(id='kpi-row', className='mb-4'),

    # Charts Row 1
    dbc.Row([
        dbc.Col([dcc.Graph(id='revenue-chart')], width=8),
        dbc.Col([dcc.Graph(id='order-type-pie')], width=4),
    ], className='mb-3'),

    # Charts Row 2
    dbc.Row([
        dbc.Col([dcc.Graph(id='top-items-chart')], width=6),
        dbc.Col([dcc.Graph(id='payment-chart')], width=6),
    ], className='mb-3'),

    # Charts Row 3
    dbc.Row([
        dbc.Col([dcc.Graph(id='hourly-heatmap')], width=8),
        dbc.Col([dcc.Graph(id='type-revenue-chart')], width=4),
    ], className='mb-3'),

    # Auto-refresh interval
    dcc.Interval(id='auto-refresh', interval=60 * 1000, n_intervals=0),
])


@app.callback(
    [Output('kpi-row', 'children'),
     Output('revenue-chart', 'figure'),
     Output('order-type-pie', 'figure'),
     Output('top-items-chart', 'figure'),
     Output('payment-chart', 'figure'),
     Output('hourly-heatmap', 'figure'),
     Output('type-revenue-chart', 'figure')],
    [Input('date-range', 'value'),
     Input('refresh-btn', 'n_clicks'),
     Input('auto-refresh', 'n_intervals')],
)
def update_all(days, _refresh, _interval):
    df = get_orders_df(days=days)
    kpis = get_kpis(df)

    kpi_cards = dbc.Row([
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6('Revenue (Period)', style={'color': '#8a7d6e', 'fontSize': '0.75rem', 'letterSpacing': '0.1em'}),
            html.H3(f"{kpis['total_revenue']:,.0f} EGP", style={'color': '#e8a830'}),
        ]), style=CARD_STYLE), width=2),
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6('Total Orders', style={'color': '#8a7d6e', 'fontSize': '0.75rem'}),
            html.H3(str(kpis['total_orders']), style={'color': '#e8a830'}),
        ]), style=CARD_STYLE), width=2),
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6('Avg Order Value', style={'color': '#8a7d6e', 'fontSize': '0.75rem'}),
            html.H3(f"{kpis['avg_order']:.0f} EGP", style={'color': '#e8a830'}),
        ]), style=CARD_STYLE), width=2),
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6("Today's Revenue", style={'color': '#8a7d6e', 'fontSize': '0.75rem'}),
            html.H3(f"{kpis['today_revenue']:,.0f} EGP", style={'color': '#4ade80'}),
        ]), style=CARD_STYLE), width=2),
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6("Today's Orders", style={'color': '#8a7d6e', 'fontSize': '0.75rem'}),
            html.H3(str(kpis['today_orders']), style={'color': '#4ade80'}),
        ]), style=CARD_STYLE), width=2),
        dbc.Col(dbc.Card(dbc.CardBody([
            html.H6('Last Updated', style={'color': '#8a7d6e', 'fontSize': '0.75rem'}),
            html.H6(datetime.now().strftime('%H:%M:%S'), style={'color': '#f5ead8'}),
        ]), style=CARD_STYLE), width=2),
    ])

    return (
        kpi_cards,
        revenue_chart(df),
        order_type_pie(df),
        top_items_chart(df),
        payment_method_chart(df),
        hourly_heatmap(df),
        revenue_by_order_type(df),
    )


if __name__ == '__main__':
    print('\n☕ 1980 Coffee Analytics Dashboard starting...')
    print('🌐 Open: http://localhost:8050\n')
    app.run(debug=True, host='0.0.0.0', port=8050)
